import { ITEMS } from '../../src/lib/content/items.ts';
import type { OpenWay } from '../../src/lib/content/lootables.ts';
import {
	allStacks,
	applyAction,
	held,
	removeItem,
	sanitizeAction
} from '../../src/lib/shared/items/inventory.ts';
import { bestWay, lootableOf, waysFor } from '../../src/lib/shared/items/lootables.ts';
import { CRATE_REACH } from '../../src/lib/shared/items/pickup.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import { crateCentre } from '../../src/lib/shared/map/crates.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import type { Crate } from '../crates.ts';
import { log } from '../log.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Lootables (docs/dev/lootables.md): holding interact on one nobody is using opens it for that
 * player, the fastest way they can (bare hands, a tool in the hand, a key carried: `bestWay`).
 * A sealed one opens only its sealed ways; a hidden seal (a jammed crate) is found by trying it.
 * While they have it open, what is in it is revealed a slot at a time and they are told what
 * they can see. It shuts when they walk away, go down or lose their connection.
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
			const def = lootableOf(crate);
			// Sealed and known (a locked trunk, a sealed niche, a jam someone found): only its sealed ways.
			const sealed = crate.lock === 'locked' || (crate.lock === 'jammed' && crate.jamFound);
			const way = bestWay(waysFor(def, sealed), s.inventory, def.id);
			if (!way) {
				// Nothing to open it with: it only rattles.
				this.stuck(player, crate);
				continue;
			}
			if (way.key) {
				this.unlock(player, crate);
				continue;
			}
			if (!this.work(player, crate, way)) continue;
			if (sealed) {
				// It gives: open at once.
				ctx.crates.release(crate);
				log.info(`${player.name} forced ${def.id} ${crate.id} open in ${ctx.id.slice(0, 8)}`);
			} else if (crate.lock === 'jammed') {
				// Stuck fast: now everyone knows, and it takes a crowbar.
				crate.jamFound = true;
				this.stuck(player, crate);
				continue;
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
				if (def.noise > 0) ctx.creatures.hear(crate.position, def.noise, null);
			}
			log.info(`${player.name} opened ${def.id} ${crate.id} in ${ctx.id.slice(0, 8)}`);
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
	 * Tried with nothing that opens it (or found jammed): it rattles, for everyone near. The press
	 * is spent: interact has to be let go before the next try.
	 */
	private stuck(player: Player, crate: Crate): void {
		player.state.opening = 0;
		player.crateLatch = true;
		this.ctx.events.push({
			kind: 'crateStuck',
			id: crate.id,
			player: player.id,
			position: crateCentre(crate)
		});
	}

	/**
	 * A press on something locked, with a key carried anywhere: it turns in the lock and is used
	 * up. The press is spent: opening it takes a hold after.
	 */
	private unlock(player: Player, crate: Crate): void {
		const ctx = this.ctx;
		const inv = player.state.inventory;
		player.state.opening = 0;
		player.crateLatch = true;
		const key = allStacks(inv).find((stack) => ITEMS[stack.item]?.unlocks);
		const position = crateCentre(crate);
		if (!key) return;
		removeItem(inv, key.item, 1);
		ctx.crates.release(crate);
		ctx.events.push({ kind: 'crateUnlock', id: crate.id, player: player.id, position });
		log.info(`${player.name} unlocked trunk ${crate.id} in ${ctx.id.slice(0, 8)}`);
	}

	/**
	 * Holding interact on it, one way: `opening` counts to the way's seconds. A way with noise is
	 * heard as it starts and every `every` seconds while it goes on (prying, smashing), with the
	 * player as the source; a crowbar at work raises `pry`. Returns true once it is done.
	 */
	private work(player: Player, crate: Crate, way: OpenWay): boolean {
		const ctx = this.ctx;
		const s = player.state;
		const before = s.opening;
		s.opening += TICK_DT;
		if (before === 0 && way.tool === 'pry') {
			ctx.events.push({
				kind: 'pry',
				target: 'crate',
				player: player.id,
				position: crateCentre(crate)
			});
		}
		const every = way.every ?? Infinity;
		const again =
			Number.isFinite(every) && Math.floor(s.opening / every) !== Math.floor(before / every);
		if (way.noise && (before === 0 || again)) {
			ctx.creatures.hear(crate.position, way.noise, { id: player.id, state: s });
		}
		if (s.opening < way.seconds) return false;
		s.opening = 0;
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
		const noise = lootableOf(crate).lootNoise;
		if (result === 'ok' && touchesLoot && noise > 0) {
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
