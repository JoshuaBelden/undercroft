import { ITEMS } from '../../src/lib/content/items.ts';
import { CORPSES, CRATES } from '../../src/lib/content/loot.ts';
import {
	allStacks,
	applyAction,
	held,
	heldWorking,
	removeItem,
	sanitizeAction
} from '../../src/lib/shared/items/inventory.ts';
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
			const pressing = !!player.lastInput?.interact;
			// A press spent on something else (a key turned, a jam found) is let go before the next.
			if (!pressing) player.crateLatch = false;
			const crate =
				able && pressing && !player.crateLatch && !ctx.items.lookedAt(s, origin, direction)
					? ctx.crates.lookedAt(origin, direction)
					: null;
			if (!crate || crate.user !== null) {
				s.opening = 0;
				continue;
			}
			if (crate.lock === 'locked') {
				this.unlock(player, crate);
				continue;
			}
			if (crate.lock === 'jammed' && crate.jamFound) {
				if (!this.pry(player, crate)) continue;
			} else {
				s.opening += TICK_DT;
				if (s.opening < CRATES.openSeconds) continue;
				s.opening = 0;
				if (crate.lock === 'jammed') {
					// Stuck fast: now everyone knows, and it takes a crowbar.
					crate.jamFound = true;
					player.crateLatch = true;
					ctx.events.push({
						kind: 'crateStuck',
						id: crate.id,
						player: player.id,
						position: crateCentre(crate)
					});
					continue;
				}
			}
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
	 * A press on a locked trunk: a key carried anywhere turns in the lock and is used up. Without
	 * one it only rattles. Either way the press is spent: opening it takes a hold after.
	 */
	private unlock(player: Player, crate: Crate): void {
		const ctx = this.ctx;
		const inv = player.state.inventory;
		player.state.opening = 0;
		player.crateLatch = true;
		const key = allStacks(inv).find((stack) => ITEMS[stack.item]?.unlocks);
		const position = crateCentre(crate);
		if (!key) {
			ctx.events.push({ kind: 'crateStuck', id: crate.id, player: player.id, position });
			return;
		}
		removeItem(inv, key.item, 1);
		ctx.crates.release(crate);
		ctx.events.push({ kind: 'crateUnlock', id: crate.id, player: player.id, position });
		log.info(`${player.name} unlocked trunk ${crate.id} in ${ctx.id.slice(0, 8)}`);
	}

	/**
	 * Holding interact on a jammed crate with something that pries in the hand: `opening` counts
	 * to `CRATES.prySeconds`, loudly. Returns true once it gives (it then opens like any crate).
	 */
	private pry(player: Player, crate: Crate): boolean {
		const ctx = this.ctx;
		const s = player.state;
		if (!heldWorking(s.inventory, 'pry')) {
			s.opening = 0;
			return false;
		}
		const before = s.opening;
		s.opening += TICK_DT;
		if (before === 0) {
			ctx.events.push({
				kind: 'pry',
				target: 'crate',
				player: player.id,
				position: crateCentre(crate)
			});
		}
		// Heard as it starts, and again every so often while it goes on.
		if (
			Math.floor(s.opening / CRATES.pryEvery) !== Math.floor(before / CRATES.pryEvery) ||
			before === 0
		) {
			ctx.creatures.hear(crate.position, CRATES.pryNoise, { id: player.id, state: s });
		}
		if (s.opening < CRATES.prySeconds) return false;
		s.opening = 0;
		ctx.crates.release(crate);
		log.info(`${player.name} pried crate ${crate.id} open in ${ctx.id.slice(0, 8)}`);
		return true;
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
		const { result, dropped } = applyAction(
			{ inventory: inv, stash: crate.slots, sealed: crate.hidden },
			action
		);
		// Rummaging through it is heard: every thing taken out of it (or put in) adds to the noise.
		const touchesLoot =
			('from' in action && action.from.area === 'stash') ||
			('to' in action && action.to.area === 'stash');
		if (result === 'ok' && touchesLoot) {
			const noise = crate.kind === 'corpse' ? CORPSES.lootNoise : CRATES.lootNoise;
			this.ctx.creatures.hear(crate.position, noise, { id: player.id, state: player.state });
		}
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
		},
		// Unjams every crate and unlocks every trunk (no key or crowbar needed).
		unlockCrates: () => {
			for (const { crate } of this.ctx.crates.list()) this.ctx.crates.release(crate);
		}
	} satisfies SessionSystem['admin'];
}
