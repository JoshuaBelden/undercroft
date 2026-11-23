import { achievementsForBanishing } from '../../src/lib/content/achievements.ts';
import { absorbBlow, newStack } from '../../src/lib/shared/items/inventory.ts';
import { unsealExtracts } from '../../src/lib/shared/map/collision.ts';
import { doorBox } from '../../src/lib/shared/map/doors.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { applyCondition } from '../../src/lib/shared/player/conditions.ts';
import { headlampOutput } from '../../src/lib/shared/player/headlamp.ts';
import { log } from '../log.ts';
import type { Player, SessionContext, SessionSystem, SimulatedFrame } from './system.ts';

/**
 * The meter, omens and the manifestation (docs/dev/affliction.md). Its blows and its ray land on
 * what is worn first, like a creature's; the ray also snuffs the lamp it hits. Banishing what the
 * rite summoned resolves the Affliction: the final room's door opens and its ladder comes down.
 */
export class AfflictionSystem implements SessionSystem {
	/** The omen stage clients were last told of (an `omen` event goes out when it changes). */
	private omen = 0;
	/** When the rite summoned the manifestation (ms); null until it does. */
	manifestedAt: number | null = null;

	constructor(private ctx: SessionContext) {}

	step(): void {
		const ctx = this.ctx;
		ctx.affliction.party = ctx.creatures.party = Math.max(1, ctx.joined);
		const prey = [...ctx.players.values()].map((p) => ({ id: p.id, state: p.state }));
		for (const hit of ctx.affliction.step(prey)) {
			const player = ctx.players.get(hit.playerId);
			if (!player) continue;
			const s = player.state;
			if (s.flags.godMode || s.downed || s.dead) continue;
			const { through, broke } = absorbBlow(s.inventory, hit.amount);
			if (broke) ctx.events.push({ kind: 'break', item: broke, position: [...s.position] });
			// Its ray puts their lamp out, and it stays out a while.
			if (hit.snuff) applyCondition(s, 'snuffed', hit.snuff);
			ctx.hurt(player, through);
		}
		for (const shot of ctx.affliction.shots) {
			ctx.events.push({ kind: 'ray', from: [...shot.from], to: [...shot.to], player: shot.player });
		}
		ctx.affliction.shots = [];
		// Banished by a weapon or an admin earlier this tick: resolved, or (with something to lay
		// to rest) fallen, leaving it.
		if (ctx.affliction.defeated) {
			if (ctx.affliction.def.rite.laid) this.fall();
			else this.resolve(null);
		}
		if (ctx.affliction.stage !== this.omen) {
			this.omen = ctx.affliction.stage;
			ctx.events.push({ kind: 'omen', stage: this.omen });
			log.info(`Session ${ctx.id.slice(0, 8)} omen stage ${this.omen}`);
		}
	}

	/** A player turned their lamp on from off: a flash that stuns what is vulnerable to it. */
	simulated(player: Player, { wasLit }: SimulatedFrame): void {
		const s = player.state;
		if (wasLit || !headlampOutput(s).on || s.downed || s.dead || s.extracted) return;
		const stunned = (this.ctx.affliction.strobe(s) ? 1 : 0) + this.ctx.creatures.strobe(s);
		this.ctx.events.push({ kind: 'strobe', player: player.id, position: [...s.position], stunned });
	}

	/** The rite was performed (or an admin forces it): the manifestation appears in its room. */
	summon(from: Vec3): void {
		const ctx = this.ctx;
		if (ctx.affliction.manifested || ctx.affliction.calmed) return;
		ctx.affliction.party = Math.max(1, ctx.joined);
		const prey = [...ctx.players.values()].map((p) => ({ id: p.id, state: p.state }));
		ctx.affliction.summon((p) => ctx.rite.inRoom(p), from, prey);
		if (!ctx.affliction.manifested) return;
		this.manifestedAt ??= Date.now();
		ctx.events.push({ kind: 'manifest' });
		this.seal();
		log.info(`Session ${ctx.id.slice(0, 8)}: the Affliction manifests`);
	}

	/**
	 * The rite's room is shut in with what was summoned: its doors slam and are barred until it is
	 * banished (`resolve` lets them go). Whoever is outside stays out.
	 */
	private seal(): void {
		const ctx = this.ctx;
		const room = ctx.affliction.def.rite.room;
		const open = new Set(ctx.doors.seal(room).map((door) => door.id));
		for (const door of ctx.doors.placements) {
			if (door.piece !== room) continue;
			ctx.events.push({
				kind: 'doorSeal',
				id: door.id,
				position: doorBox(door).center,
				open: open.has(door.id)
			});
		}
	}

	private prey() {
		return [...this.ctx.players.values()].map((p) => ({ id: p.id, state: p.state }));
	}

	/**
	 * Put down, with something to be laid to rest (RiteSpec.laid): it lies where it fell, and the
	 * room stays sealed until it is laid where the rite was performed (RiteSystem).
	 */
	private fall(): void {
		const ctx = this.ctx;
		if (ctx.rite.fallen || ctx.rite.resolved) return;
		ctx.rite.fallen = true;
		const laid = ctx.affliction.def.rite.laid!;
		const at = ctx.affliction.snapshot().manifestation?.position ?? ctx.rite.tomb ?? [0, 0, 0];
		const floor = ctx.freeSpot([at[0], at[1], at[2]]);
		ctx.items.place(newStack(laid.item), [floor[0], floor[1] + 0.05, floor[2]], 0);
		ctx.events.push({ kind: 'fallen', item: laid.item, position: [...floor] });
		log.info(`The Affliction fell in ${ctx.id.slice(0, 8)}, leaving ${laid.item}`);
	}

	/**
	 * The rite is done: the Affliction is resolved, for `eligible` (those who could begin it;
	 * null: everyone who went down), and calmed (omens lift). They still have to get out past the
	 * creatures.
	 */
	resolve(eligible: Player[] | null): void {
		const ctx = this.ctx;
		if (ctx.rite.resolved) return;
		ctx.rite.resolved = true;
		const at = ctx.affliction.snapshot().manifestation?.position ?? [0, 0, 0];
		ctx.events.push({ kind: 'resolved', position: [...at] });
		// The doors it was shut in behind open, and the way out comes down.
		for (const door of ctx.doors.release()) {
			ctx.events.push({ kind: 'doorRelease', id: door.id, position: doorBox(door).center });
		}
		unsealExtracts(ctx.world);
		const owners = (eligible ?? [...ctx.players.values()]).map((p) => p.owner);
		ctx.hooks.onResolved?.(owners);
		for (const player of eligible ?? []) {
			ctx.systems.quests.happened({ kind: 'resolve', affliction: ctx.affliction.def.id }, player);
		}
		ctx.awardEveryoneDown(achievementsForBanishing());
		log.info(`The Affliction was resolved in ${ctx.id.slice(0, 8)}`);
	}

	admin = {
		setMeter: (_player, command) => {
			if (typeof command.value !== 'number' || !Number.isFinite(command.value)) return;
			this.ctx.affliction.setMeter(command.value);
		},
		manifest: (player) => this.summon(player.state.position),
		banish: () => this.ctx.affliction.banish(),
		fell: (player) => {
			if (!this.ctx.affliction.def.rite.laid) return false;
			this.summon(player.state.position);
			this.ctx.affliction.banish();
		},
		stun: () => this.ctx.affliction.stun(),
		bossStrike: () => this.ctx.affliction.forceStrike(this.prey()),
		bossRay: () => this.ctx.affliction.forceRay(this.prey()),
		bossRush: () => this.ctx.affliction.forceRush(this.prey()),
		bossVanish: () => this.ctx.affliction.forceVanish()
	} satisfies SessionSystem['admin'];
}
