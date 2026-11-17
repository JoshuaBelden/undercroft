import { ITEMS } from '../../src/lib/content/items.ts';
import { CORPSES, CRATES } from '../../src/lib/content/loot.ts';
import { applyAction, held, sanitizeAction } from '../../src/lib/shared/items/inventory.ts';
import { CRATE_REACH } from '../../src/lib/shared/items/pickup.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import { crateCentre } from '../../src/lib/shared/map/crates.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import type { Crate } from '../crates.ts';
import { log } from '../log.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Loot crates and corpses (docs/dev/items.md): holding interact on one nobody is using opens it
 * for that player. While they have it open, what is in it is revealed a slot at a time and they
 * are told what they can see. It shuts when they walk away, go down or lose their connection.
 */
export class CrateSystem implements SessionSystem {
	constructor(private ctx: SessionContext) {}

	step(): void {
		const ctx = this.ctx;
		for (const player of ctx.players.values()) {
			const s = player.state;
			const able = !s.downed && !s.dead && !s.extracted && !s.swimming;
			const { origin, direction } = aimRay(s, eyeHeight(s));
			if (player.crate) {
				s.opening = 0;
				const crate = ctx.crates.get(player.crate);
				const centre = crate ? crateCentre(crate) : origin;
				const away = Math.hypot(
					centre[0] - origin[0],
					centre[1] - origin[1],
					centre[2] - origin[2]
				);
				const connected = player.socket.readyState === player.socket.OPEN;
				if (!crate || !able || !connected || away > CRATE_REACH.leave) this.shut(player);
				continue;
			}
			const crate =
				able && player.lastInput?.interact && !ctx.items.lookedAt(s, origin, direction)
					? ctx.crates.lookedAt(origin, direction)
					: null;
			if (!crate || crate.user !== null) {
				s.opening = 0;
				continue;
			}
			s.opening += TICK_DT;
			if (s.opening < CRATES.openSeconds) continue;
			s.opening = 0;
			player.crate = crate.id;
			if (ctx.crates.open(crate, player.id)) {
				ctx.events.push({
					kind: 'crateOpen',
					id: crate.id,
					player: player.id,
					position: crateCentre(crate)
				});
				// No source: creatures that hear the lid (or, more quietly, a body turned over) go and look.
				const noise = crate.kind === 'corpse' ? CORPSES.noise : CRATES.noise;
				ctx.creatures.hear(crate.position, noise, null);
			}
			log.info(`${player.name} opened crate ${crate.id} in ${ctx.id.slice(0, 8)}`);
		}
		for (const crate of ctx.crates.step(TICK_DT)) {
			if (!crate.user) continue;
			ctx.events.push({ kind: 'rummage', player: crate.user, position: crateCentre(crate) });
		}
		for (const player of ctx.players.values()) {
			const crate = player.crate ? ctx.crates.get(player.crate) : null;
			if (crate) ctx.send(player, { type: 'crate', id: crate.id, ...ctx.crates.view(crate) });
		}
	}

	/**
	 * A pack request with a loot crate open: its slots stand where the stash does on the surface,
	 * so things move both ways. What hasn't been revealed yet can't be touched.
	 */
	loot(player: Player, crate: Crate, raw: unknown): void {
		const action = sanitizeAction(raw, true);
		if (!action) return;
		// A hint is read where it lies, never carried.
		const from = 'from' in action ? action.from : null;
		if (from?.area === 'stash' && !crate.hidden.has(from.index)) {
			const stack = crate.slots[from.index];
			if (stack && ITEMS[stack.item]?.kind === 'clue') {
				if (this.ctx.systems.rite.readClue(player, crate.position)) {
					this.ctx.crates.clear(crate, from.index);
				}
				return;
			}
		}
		const inv = player.state.inventory;
		const inHand = held(inv);
		const { dropped } = applyAction(
			{ inventory: inv, stash: crate.slots, sealed: crate.hidden },
			action
		);
		this.ctx.systems.pack.afterRequest(player, inHand, dropped);
	}

	/** The player is done with the loot crate they had open. */
	close(player: Player): void {
		// Always answered, even if it had shut already: the client waits for this.
		if (player.crate) this.shut(player);
		else this.ctx.send(player, { type: 'crate', id: null, slots: [], reveal: 0 });
	}

	private shut(player: Player): void {
		if (!player.crate) return;
		const crate = this.ctx.crates.get(player.crate);
		if (crate) this.ctx.crates.close(crate);
		player.crate = null;
		this.ctx.send(player, { type: 'crate', id: null, slots: [], reveal: 0 });
	}

	reconnecting(player: Player): void {
		this.shut(player);
	}

	left(player: Player): void {
		this.shut(player);
	}

	downed(player: Player): void {
		this.shut(player);
	}

	regenerating(): void {
		for (const player of this.ctx.players.values()) this.shut(player);
	}

	admin = {
		resetCrates: () => {
			for (const player of this.ctx.players.values()) this.shut(player);
			this.ctx.crates.fill();
		}
	} satisfies SessionSystem['admin'];
}
