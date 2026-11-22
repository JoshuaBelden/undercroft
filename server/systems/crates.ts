import { ITEMS } from '../../src/lib/content/items.ts';
import type { OpenWay } from '../../src/lib/content/lootables.ts';
import {
	addItem,
	allStacks,
	applyAction,
	held,
	newStack,
	removeItem,
	sanitizeAction
} from '../../src/lib/shared/items/inventory.ts';
import { fragmentFinds } from '../../src/lib/shared/items/crafting.ts';
import { bestWay, lootableOf, waysFor, firstKey } from '../../src/lib/shared/items/lootables.ts';
import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { addWear } from '../../src/lib/shared/items/durability.ts';
import { workingGear } from '../../src/lib/shared/items/inventory.ts';
import { DROP_BOXES } from '../../src/lib/content/loot.ts';
import { floorHeightAt, segmentHit } from '../../src/lib/shared/map/collision.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { ItemStack } from '../../src/lib/shared/player/types.ts';
import { applyCondition } from '../../src/lib/shared/player/conditions.ts';
import { CRATE_REACH, markInSight } from '../../src/lib/shared/items/pickup.ts';
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

	/** Seconds each player has spent looking at the hidden lootable they are looking at. */
	private noticing = new Map<string, { crate: string; seconds: number }>();

	step(): void {
		const ctx = this.ctx;
		this.notice();
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
			if (def.fill) {
				this.fillAt(player, crate);
				continue;
			}
			// Sealed and known (a locked trunk, a sealed niche, a jam someone found): only its sealed ways.
			const sealed = crate.lock === 'locked' || (crate.lock === 'jammed' && crate.jamFound);
			const way = bestWay(waysFor(def, sealed), s.inventory, def.id, this.helpers(player, crate));
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
			const first = ctx.crates.open(crate, player.id);
			if (first) this.scrounge(player, crate);
			this.reachIn(player, crate, first);
			if (way.breaks) this.shatter(crate, way.breaks);
			if (first) {
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
			if (!crate) continue;
			ctx.send(player, { type: 'crate', id: crate.id, ...ctx.crates.view(crate) });
			const source = lootableOf(crate).id;
			crate.slots.forEach((stack, index) => {
				if (stack && !crate.hidden.has(index)) ctx.discover(player, stack.item, source);
			});
		}
	}

	/**
	 * A hidden lootable (a smuggler's stash) looked at from near enough, long enough, is noticed:
	 * from then on anyone can open it. Looking means the same aim as opening, a little farther.
	 */
	private notice(): void {
		const ctx = this.ctx;
		const unseen = ctx.crates.unseen();
		for (const player of ctx.players.values()) {
			const s = player.state;
			if (!unseen.length || s.downed || s.dead || s.extracted) {
				this.noticing.delete(player.id);
				continue;
			}
			const { origin, direction } = aimRay(s, eyeHeight(s));
			const crate = unseen.find((c) => {
				const hidden = lootableOf(c).hidden!;
				const centre = crateCentre(c);
				const to: Vec3 = [centre[0] - origin[0], centre[1] - origin[1], centre[2] - origin[2]];
				const d = Math.hypot(...to);
				if (d > hidden.reach) return false;
				const along =
					(to[0] * direction[0] + to[1] * direction[1] + to[2] * direction[2]) / Math.max(d, 1e-6);
				return along > Math.cos(0.3) && markInSight(ctx.world, origin, centre);
			});
			if (!crate) {
				this.noticing.delete(player.id);
				continue;
			}
			const was = this.noticing.get(player.id);
			const seconds = (was?.crate === crate.id ? was.seconds : 0) + TICK_DT;
			this.noticing.set(player.id, { crate: crate.id, seconds });
			if (seconds < lootableOf(crate).hidden!.seconds) continue;
			crate.unseen = false;
			this.noticing.delete(player.id);
			ctx.events.push({
				kind: 'noticed',
				crate: crate.id,
				player: player.id,
				position: crateCentre(crate)
			});
		}
	}

	/**
	 * Holding interact at a font (docs/dev/world.md#fonts), with what it fills in the pack: one is
	 * turned into what it makes after `fill.seconds`, until it runs dry. With nothing to fill, or
	 * once it is dry, nothing happens.
	 */
	private fillAt(player: Player, crate: Crate): void {
		const ctx = this.ctx;
		const s = player.state;
		const fill = lootableOf(crate).fill!;
		const has = allStacks(s.inventory).some((stack) => stack.item === fill.needs);
		if (crate.fills <= 0 || !has) {
			s.opening = 0;
			return;
		}
		s.opening += TICK_DT;
		if (s.opening < fill.seconds) return;
		s.opening = 0;
		player.crateLatch = true;
		removeItem(s.inventory, fill.needs, 1);
		const left = addItem(s.inventory, newStack(fill.makes));
		if (left > 0) ctx.items.dropAll([newStack(fill.makes, left)], s.position);
		crate.fills--;
		ctx.discover(player, fill.makes, lootableOf(crate).id);
		ctx.events.push({
			kind: 'filled',
			crate: crate.id,
			player: player.id,
			item: fill.makes,
			position: crateCentre(crate)
		});
	}

	/** Other players holding interact at the same lootable this tick (two on a stone lid). */
	private helpers(player: Player, crate: Crate): number {
		let n = 0;
		for (const other of this.ctx.players.values()) {
			if (other === player || !other.lastInput?.interact || !this.ctx.canUseHands(other)) continue;
			const { origin, direction } = aimRay(other.state, eyeHeight(other.state));
			if (this.ctx.crates.lookedAt(origin, direction) === crate) n++;
		}
		return n;
	}

	/**
	 * Someone reached into it (docs/dev/world.md#catches): what bites or stings them unless they
	 * wear something against it, what its room costs (the plague pit), and the first time, what
	 * comes out of it and what it feeds the meter.
	 */
	private reachIn(player: Player, crate: Crate, first: boolean): void {
		const ctx = this.ctx;
		const def = lootableOf(crate);
		const s = player.state;
		const gear = workingGear(s.inventory);
		const worn = new Set(gear.flatMap((stack) => ITEMS[stack.item]?.protects ?? []));
		// What kept something off wears a use for it (gloves).
		const kept = (against: string): void => {
			const by = gear.find((stack) => ITEMS[stack.item]?.protects?.includes(against));
			if (by && addWear(by, s.mods.wear) === 'broke')
				ctx.events.push({ kind: 'break', item: by.item, position: [...s.position] });
		};
		const position: Vec3 = crateCentre(crate);
		for (const c of def.catches ?? []) {
			if ((c.kind === 'bite' || c.kind === 'condition') && worn.has(c.unless)) {
				kept(c.unless);
			} else if (c.kind === 'bite') {
				ctx.hurt(player, c.damage);
				ctx.events.push({ kind: 'bitten', player: player.id, position });
			} else if (c.kind === 'condition') {
				applyCondition(s, c.condition, c.seconds);
				ctx.events.push({ kind: 'bitten', player: player.id, position });
			} else if (c.kind === 'spawn' && first && Math.random() < c.chance) {
				const count = c.count[0] + Math.floor(Math.random() * (c.count[1] - c.count[0] + 1));
				ctx.creatures.spawnAt(c.creature, crate.position, count, { id: player.id, state: s });
			}
		}
		if (first && def.meter) ctx.affliction.raise(def.meter);
		const drain =
			MAP_KIT[ctx.layout.crates.find((p) => p.id === crate.id)?.piece ?? '']?.searchSanity;
		if (drain) ctx.hurt(player, drain);
	}

	/** Smashed open: each fragile thing in it breaks with this chance. */
	private shatter(crate: Crate, chance: number): void {
		crate.slots.forEach((stack, index) => {
			if (!stack || !ITEMS[stack.item]?.fragile || Math.random() >= chance) return;
			this.ctx.crates.clear(crate, index);
			this.ctx.events.push({ kind: 'shatter', item: stack.item, position: crateCentre(crate) });
		});
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
		const key = firstKey(inv);
		const position = crateCentre(crate);
		if (!key) return;
		removeItem(inv, key.item, 1);
		ctx.crates.release(crate);
		ctx.events.push({ kind: 'crateUnlock', id: crate.id, player: player.id, position });
		log.info(`${player.name} unlocked trunk ${crate.id} in ${ctx.id.slice(0, 8)}`);
	}

	/**
	 * Scrounger (docs/dev/progression.md): the first to open it may find one more material, from
	 * what it can hold, in a slot it has free. Materials only, so each level's treasure budget holds.
	 */
	private scrounge(player: Player, crate: Crate): void {
		const chance = player.state.mods.scrounge;
		if (chance <= 0 || Math.random() >= chance || !crate.slots.includes(null)) return;
		const def = lootableOf(crate);
		if (def.dropped) return;
		const materials = def.loot.filter((entry) => ITEMS[entry.item]?.category === 'material');
		if (materials.length === 0) return;
		const pick = materials[Math.floor(Math.random() * materials.length)];
		this.ctx.crates.stowIn(crate.id, newStack(pick.item, 1));
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
			ctx.creatures.hear(crate.position, way.noise * s.mods.openNoise, { id: player.id, state: s });
		}
		if (s.opening < way.seconds * s.mods.openTime) return false;
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
		// A hint is read where it lies, never carried; so is a recipe fragment.
		const from = 'from' in action ? action.from : null;
		if (from?.area === 'stash' && !crate.hidden.has(from.index)) {
			const stack = crate.slots[from.index];
			if (stack && ITEMS[stack.item]?.fragment) {
				this.readFragment(player);
				this.ctx.crates.clear(crate, from.index);
				return;
			}
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

	/**
	 * A recipe fragment read (docs/dev/crafting.md#fragments): it discovers an ingredient they
	 * haven't seen of a recipe they have started, or of any recipe if none; or it is only a note.
	 */
	private readFragment(player: Player): void {
		const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
		const item = fragmentFinds(player.discovered, pick);
		if (item) this.ctx.discover(player, item, 'fragment');
		this.ctx.send(player, { type: 'fragment', item });
	}

	/** The player is done with the loot crate they had open. */
	close(player: Player): void {
		// Always answered, even if it had shut already: the client waits for this.
		if (player.crate) this.shut(player);
		else this.ctx.send(player, { type: 'crate', id: null, slots: [], reveal: 0 });
	}

	/**
	 * Something a player dropped (docs/dev/lootables.md#drop-boxes): into a drop box of theirs
	 * nearby if there is one, else, if it has no model to lie on the floor as, into a new box of
	 * theirs in front of them. Returns what is left to drop on the floor (null: all boxed).
	 */
	dropInBox(player: Player, stack: ItemStack): ItemStack | null {
		const s = player.state;
		const { origin, direction } = aimRay(s, eyeHeight(s));
		const flat = Math.hypot(direction[0], direction[2]) || 1;
		const [dx, dz] = [direction[0] / flat, direction[2] / flat];
		// On the floor in front, if it is there and nothing is in the way; else at their feet.
		const ahead: Vec3 = [
			s.position[0] + dx * DROP_BOXES.ahead,
			s.position[1],
			s.position[2] + dz * DROP_BOXES.ahead
		];
		const floor = floorHeightAt(
			this.ctx.world,
			ahead[0],
			ahead[2],
			s.position[1] + 0.5,
			s.position[1] - 0.5
		);
		const clear =
			floor !== null &&
			segmentHit(this.ctx.world, origin, [ahead[0], floor + 0.2, ahead[2]]) === null;
		const at: Vec3 = clear ? [ahead[0], floor, ahead[2]] : [...s.position];
		// Its front (the hasp) toward the one who put it down.
		const yaw = Math.atan2(-dx, -dz);
		const make = !ITEMS[stack.item]?.model;
		const left = this.ctx.crates.drop(stack, player.id, s.position, at, yaw, make);
		if (left < stack.count) {
			this.ctx.events.push({ kind: 'boxed', player: player.id, item: stack.item, position: at });
		}
		return left > 0 ? { ...stack, count: left } : null;
	}

	private shut(player: Player): void {
		if (!player.crate) return;
		const crate = this.ctx.crates.get(player.crate);
		if (crate) {
			this.ctx.crates.close(crate);
			// A drop box closed empty is gone.
			this.ctx.crates.tidy(crate);
		}
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
		// Unjams every crate, unlocks every trunk, finds every smuggler's stash and fills every font.
		unlockCrates: () => {
			for (const { crate } of this.ctx.crates.list()) this.ctx.crates.free(crate);
		},
		// Every drop box gone, with what is in it.
		clearDropBoxes: () => {
			for (const player of this.ctx.players.values()) {
				if (player.crate?.startsWith('box-')) this.shut(player);
			}
			this.ctx.crates.clearBoxes();
		}
	} satisfies SessionSystem['admin'];
}
