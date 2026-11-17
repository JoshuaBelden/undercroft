import { achievementsForBanishing } from '../../src/lib/content/achievements.ts';
import { absorbBlow } from '../../src/lib/shared/items/inventory.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { headlampOutput } from '../../src/lib/shared/player/headlamp.ts';
import { log } from '../log.ts';
import type { Player, SessionContext, SessionSystem, SimulatedFrame } from './system.ts';

/**
 * The meter, omens and the manifestation (docs/dev/affliction.md). Its blows land on what is
 * worn first, like a creature's. Banishing what the rite summoned resolves the Affliction.
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
			const { through, torn } = absorbBlow(s.inventory, hit.amount);
			if (torn) ctx.events.push({ kind: 'break', item: torn, position: [...s.position] });
			ctx.hurt(player, through);
		}
		// Banished by a weapon or an admin earlier this tick.
		if (ctx.affliction.defeated) this.resolve();
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
		log.info(`Session ${ctx.id.slice(0, 8)}: the Affliction manifests`);
	}

	/**
	 * What the rite summoned was banished: the Affliction is resolved for everyone who went down,
	 * and calmed (omens lift). They still have to get out past the creatures.
	 */
	private resolve(): void {
		const ctx = this.ctx;
		if (ctx.rite.resolved) return;
		ctx.rite.resolved = true;
		const at = ctx.affliction.snapshot().manifestation?.position ?? [0, 0, 0];
		ctx.events.push({ kind: 'resolved', position: [...at] });
		ctx.hooks.onResolved?.();
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
		stun: () => this.ctx.affliction.stun()
	} satisfies SessionSystem['admin'];
}
