import { ITEMS, rarityOf } from '../src/lib/content/items.ts';
import { CRATES, DROP_BOXES, TRUNKS } from '../src/lib/content/loot.ts';
import type { LootableDef } from '../src/lib/content/lootables.ts';
import { addToSlots, emptySlots, newStack, type Slots } from '../src/lib/shared/items/inventory.ts';
import { lootableOf } from '../src/lib/shared/items/lootables.ts';
import { rollLootable, trimToBudget } from '../src/lib/shared/items/loot.ts';
import { lookedAtCrate } from '../src/lib/shared/items/pickup.ts';
import type { CrateSlot, CratesSnapshot } from '../src/lib/shared/items/types.ts';
import type { CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { gridDistances, nearestPoint, type NavGrid } from '../src/lib/shared/map/nav.ts';
import type { CratePlacement, Vec3 } from '../src/lib/shared/map/types.ts';
import type { ItemStack } from '../src/lib/shared/player/types.ts';
import { Rng } from '../src/lib/shared/rng.ts';

/**
 * Lootables: crates, corpses, trunks and the rest (LOOTABLES). Where they stand comes with the map
 * (`layout.crates`); this holds what is in each, whether it is sealed, what of it has been
 * revealed, and who is going through it. One player at a time. Things are revealed one slot at a
 * time while someone has one open. See docs/dev/lootables.md.
 */

export interface Crate {
	id: string;
	position: Vec3;
	/** What kind of lootable it is (LOOTABLES); absent for a crate. */
	kind?: CratePlacement['kind'];
	/**
	 * Sealed (its `sealed` ways open it): jammed, a seal nobody can see until they try it (a crate
	 * stuck fast); locked, one anyone can see (a locked trunk, a sealed niche). Null once pried or
	 * unlocked, and for everything else.
	 */
	lock: 'jammed' | 'locked' | null;
	/** Someone has tried it and found it jammed: from then on everyone is told (the snapshot). */
	jamFound: boolean;
	/** It was sealed when its loot was rolled: a sealed niche holds better things. */
	sealed: boolean;
	slots: Slots;
	/** Slots holding something nobody has seen yet. They can't be touched. */
	hidden: Set<number>;
	/** Player going through it. */
	user: string | null;
	/** Opened at least once: its lid stays up. */
	opened: boolean;
	/** Hidden (a smuggler's stash) and not yet noticed: it can't be opened, and isn't told of. */
	unseen: boolean;
	/** Filled from (a font): how many fills are left. */
	fills: number;
	/** Seconds spent on the slot being revealed. Lost when the crate is closed. */
	progress: number;
	/** A drop box (`kind: 'dropBox'`): the player who dropped into it first, and its turn. */
	box?: { owner: string; yaw: number };
}

export class Crates {
	private crates = new Map<string, Crate>();
	/** How deep each crate is in its level: 0 nearest where the level begins, 1 farthest. */
	private depth = new Map<string, number>();
	/** The level of the map each crate is on. */
	private tier = new Map<string, number>();
	/** How far each crate is from the start along the floor (m). */
	private fromStart = new Map<string, number>();
	/** Counts fills, so refilling (admin) gives something new. */
	private fills = 0;
	/**
	 * Drop boxes (docs/dev/lootables.md#drop-boxes): made where explorers drop things, kept apart
	 * from the map's lootables so nothing rolls, stows or hides keys in them.
	 */
	private boxes = new Map<string, Crate>();
	private nextBox = 1;

	constructor(
		private world: CollisionWorld,
		placements: CratePlacement[],
		nav: NavGrid,
		start: Vec3,
		private seed: number,
		/** Locked gates in the map (the mausoleum's): each needs a key hidden, like a trunk. */
		private gates = 0
	) {
		const distance = gridDistances(nav, [nearestPoint(nav, start)], true);
		const along = new Map(placements.map((c) => [c.id, distance[nearestPoint(nav, c.position)]]));
		// Depth within each level: from its nearest crate (by the floor, from the start) to its farthest.
		const span = new Map<number, [number, number]>();
		for (const { id, tier } of placements) {
			const d = along.get(id);
			if (d === undefined) continue;
			const [lo, hi] = span.get(tier) ?? [Infinity, -Infinity];
			span.set(tier, [Math.min(lo, d), Math.max(hi, d)]);
		}
		// Which are sealed: their own stream, so the loot rolled doesn't change with it.
		const jams = new Rng(seed ^ 0x7a33ed);
		// How full each font is: its own stream too.
		const fillRng = new Rng(seed ^ 0xf0a7);
		for (const { id, position, kind, tier } of placements) {
			const seal = lootableOf({ kind }).sealed;
			const roll = jams.next();
			const lock = seal && roll < seal.chance ? (seal.hidden ? 'jammed' : 'locked') : null;
			const d = along.get(id);
			const [lo, hi] = span.get(tier) ?? [0, 0];
			this.depth.set(id, d !== undefined && hi > lo ? (d - lo) / (hi - lo) : 0);
			this.tier.set(id, tier);
			this.fromStart.set(id, d ?? Infinity);
			this.crates.set(id, {
				id,
				position,
				kind,
				lock,
				jamFound: false,
				sealed: lock !== null,
				slots: [],
				hidden: new Set(),
				user: null,
				opened: false,
				unseen: !!lootableOf({ kind }).hidden,
				fills: fillsOf(lootableOf({ kind }), fillRng),
				progress: 0
			});
		}
		this.fill();
		this.hideKeys(new Rng(seed ^ 0x6e75));
	}

	/**
	 * One key per thing a key opens (a locked trunk, and a locked gate), each in a lootable you can
	 * walk to and open by hand that isn't locked or jammed (anywhere opened by hand if there is
	 * none), so no key is ever behind a lock. Seeded by the map seed.
	 */
	private hideKeys(rng: Rng): void {
		const open = [...this.crates.values()].filter(
			(crate) =>
				crate.lock === null &&
				byHand(crate) &&
				Number.isFinite(this.fromStart.get(crate.id) ?? Infinity)
		);
		for (let i = 0; i < this.trunks().length + this.gates; i++) {
			if (open.length) this.put(rng.pick(open), newStack(TRUNKS.key));
			else this.stow(newStack(TRUNKS.key), rng);
		}
	}

	/**
	 * Shut every crate and fill it again, hidden. Seeded by the map seed. Quest items and hints
	 * still in a crate stay in it: the roll would lose them.
	 */
	fill(): void {
		const rng = new Rng(this.seed ^ 0x10075 ^ Math.imul(this.fills++, 0x9e3779b9));
		const kept = new Map<Crate, ItemStack[]>();
		for (const crate of this.crates.values()) {
			kept.set(
				crate,
				crate.slots.filter((stack): stack is ItemStack => stack !== null && placed(stack.item))
			);
			const tier = this.tier.get(crate.id) ?? 0;
			const depth = this.depth.get(crate.id) ?? 0;
			crate.slots = rollLootable(lootableOf(crate), tier, depth, rng, crate.sealed);
			crate.user = null;
			crate.opened = false;
			crate.progress = 0;
		}
		// Each level's treasure within its budget: its own stream, so the rolls above don't change.
		const budget = new Rng(this.seed ^ 0xb0d6e7 ^ Math.imul(this.fills, 0x9e3779b9));
		const tiers = new Set(this.tier.values());
		// A trunk's (an alcove's) promised prize is the last thing the budget takes.
		const prizes = new Set<ItemStack>();
		for (const crate of this.crates.values()) {
			if (lootableOf(crate).prize === undefined) continue;
			for (const stack of crate.slots) {
				const rarity = stack ? rarityOf(stack.item) : null;
				if (stack && (rarity === 'epic' || rarity === 'legendary')) prizes.add(stack);
			}
		}
		for (const tier of [...tiers].sort()) {
			const here = [...this.crates.values()].filter((crate) => this.tier.get(crate.id) === tier);
			const slots = here.map((crate) => crate.slots);
			// Everything else first; a prize only if the level is over its budget even so.
			trimToBudget(slots, tier, budget, (stack) => prizes.has(stack));
			trimToBudget(slots, tier, budget);
		}
		for (const crate of this.crates.values()) {
			// What was taken out leaves no gaps: what is left starts at the first slot.
			const left = crate.slots.filter((stack) => stack !== null);
			crate.slots = crate.slots.map((_, index) => left[index] ?? null);
			crate.hidden = new Set(left.map((_, index) => index));
			for (const stack of kept.get(crate) ?? []) this.put(crate, stack);
		}
	}

	/**
	 * Put something in one of the map's crates, on top of what the crate rolled (a rite's item).
	 * `nearStart` picks the crate nearest the start; otherwise any, by `rng`.
	 * Returns false if the map has no crate to put it in.
	 */
	stow(stack: ItemStack, rng: Rng, nearStart = false): boolean {
		const distance = (crate: Crate): number => this.fromStart.get(crate.id) ?? Infinity;
		// Only crates you can walk to: never below a drop you need rope for (docs/dev/rope.md).
		// Never behind a lock or a tool: what is stowed (a rite's item, a trunk's key) can't need a
		// key or a crowbar itself (a jammed crate is fine: its jam is only found by trying it).
		const every = [...this.crates.values()].filter(byHand);
		const walkable = every.filter((crate) => Number.isFinite(distance(crate)));
		const all = walkable.length ? walkable : every;
		if (all.length === 0) return false;
		const crate = nearStart
			? all.reduce((best, c) => (distance(c) < distance(best) ? c : best))
			: rng.pick(all);
		this.put(crate, stack);
		return true;
	}

	/** Put something in this crate, on top of what it rolled (a hint). */
	stowIn(id: string, stack: ItemStack): boolean {
		const crate = this.crates.get(id);
		if (!crate) return false;
		this.put(crate, stack);
		return true;
	}

	/** Every crate (and corpse), with how far it is from the start along the floor (m). */
	list(): { crate: Crate; fromStart: number }[] {
		return [...this.crates.values()].map((crate) => ({
			crate,
			fromStart: this.fromStart.get(crate.id) ?? Infinity
		}));
	}

	/** Take every stack of an item out of every crate (a hint nobody needs, a withheld quest item). */
	removeItem(item: string): void {
		for (const crate of this.crates.values()) {
			crate.slots = crate.slots.map((stack, index) => {
				if (stack?.item !== item) return stack;
				crate.hidden.delete(index);
				return null;
			});
		}
	}

	/** Take one slot's stack out of a crate (a hint read where it lay). */
	clear(crate: Crate, index: number): void {
		crate.slots[index] = null;
		crate.hidden.delete(index);
	}

	/**
	 * Add a stack to a crate, hidden, after everything else in it so it is the last revealed. A
	 * full crate loses its commonest thing (the first slot that isn't placed there on purpose) to
	 * make room.
	 */
	private put(crate: Crate, stack: ItemStack): void {
		const held = crate.slots.filter((s) => s !== null);
		if (held.length >= crate.slots.length) {
			const drop = held.findIndex((s) => !placed(s.item));
			held.splice(drop === -1 ? 0 : drop, 1);
		}
		held.push(stack);
		crate.slots = crate.slots.map((_, index) => held[index] ?? null);
		crate.hidden = new Set(held.map((_, index) => index));
	}

	get(id: string): Crate | null {
		return this.crates.get(id) ?? this.boxes.get(id) ?? null;
	}

	/**
	 * Put a stack in a drop box: `player`'s own within DROP_BOXES.reach of `near` if there is one
	 * with room, else a new one of theirs at `at` turned to `yaw` (only if `make`). Returns how
	 * many didn't go in a box.
	 */
	drop(stack: ItemStack, player: string, near: Vec3, at: Vec3, yaw: number, make: boolean): number {
		const own = [...this.boxes.values()].filter(
			(box) =>
				box.box?.owner === player &&
				Math.abs(box.position[1] - near[1]) < 1 &&
				Math.hypot(box.position[0] - near[0], box.position[2] - near[2]) <= DROP_BOXES.reach
		);
		let left = stack.count;
		for (const box of own) {
			if (left <= 0) break;
			left = addToSlots(box.slots, { ...stack, count: left });
		}
		if (left > 0 && (make || own.length > 0)) {
			const box = this.makeBox(at, yaw, player);
			left = addToSlots(box.slots, { ...stack, count: left });
		}
		return left;
	}

	private makeBox(position: Vec3, yaw: number, owner: string): Crate {
		const id = `box-${this.nextBox++}`;
		const box: Crate = {
			id,
			position: [...position],
			kind: 'dropBox',
			lock: null,
			jamFound: false,
			sealed: false,
			slots: emptySlots(lootableOf({ kind: 'dropBox' }).slots),
			// What was dropped is known: nothing in a box is hidden.
			hidden: new Set(),
			user: null,
			opened: false,
			unseen: false,
			fills: 0,
			progress: 0,
			box: { owner, yaw }
		};
		this.boxes.set(id, box);
		return box;
	}

	/** Closed with nothing in it: a drop box is gone. Returns whether it was taken away. */
	tidy(crate: Crate): boolean {
		if (!crate.box || crate.user !== null || crate.slots.some((stack) => stack !== null)) {
			return false;
		}
		return this.boxes.delete(crate.id);
	}

	/** Admin: every drop box gone, and what is in them. */
	clearBoxes(): void {
		this.boxes.clear();
	}

	snapshot(): CratesSnapshot {
		const all = [...this.crates.values(), ...this.boxes.values()];
		return {
			open: all.filter((c) => c.opened).map((c) => c.id),
			busy: all.filter((c) => c.user !== null).map((c) => c.id),
			// Only the jams someone has found: the rest look like any crate until tried.
			jammed: all.filter((c) => c.lock === 'jammed' && c.jamFound).map((c) => c.id),
			locked: all.filter((c) => c.lock === 'locked').map((c) => c.id),
			noticed: all.filter((c) => !c.unseen && lootableOf(c).hidden).map((c) => c.id),
			dry: all.filter((c) => lootableOf(c).fill && c.fills <= 0).map((c) => c.id),
			boxes: [...this.boxes.values()].map((c) => ({
				id: c.id,
				position: c.position,
				yaw: c.box?.yaw ?? 0,
				owner: c.box?.owner ?? ''
			}))
		};
	}

	/** Everything in the map a key opens: each needs a key from somewhere else (hideKeys). */
	trunks(): Crate[] {
		return [...this.crates.values()].filter(
			(crate) => crate.lock === 'locked' && !!lootableOf(crate).sealed?.open.some((way) => way.key)
		);
	}

	/** Unjam or unlock a crate (pried, a key turned, or an admin). */
	release(crate: Crate): void {
		crate.lock = null;
	}

	/** Admin: unsealed, a hidden one found, a font full again. */
	free(crate: Crate): void {
		crate.lock = null;
		crate.unseen = false;
		const fill = lootableOf(crate).fill;
		if (fill) crate.fills = Math.max(crate.fills, fill.fills[1]);
	}

	/** The crate a player is looking at within reach, or null (see lookedAtCrate). */
	lookedAt(eye: Vec3, look: Vec3): Crate | null {
		return lookedAtCrate(
			this.world,
			eye,
			look,
			[...this.crates.values(), ...this.boxes.values()].filter((c) => !c.unseen)
		);
	}

	/** Hidden ones nobody has noticed yet (a smuggler's stash). */
	unseen(): Crate[] {
		return [...this.crates.values()].filter((c) => c.unseen);
	}

	/** A player starts going through a crate. Returns whether this is the first time it is opened. */
	open(crate: Crate, player: string): boolean {
		const first = !crate.opened;
		crate.user = player;
		crate.opened = true;
		crate.progress = 0;
		return first;
	}

	/** The player is done with it. What they were part-way through revealing starts over. */
	close(crate: Crate): void {
		crate.user = null;
		crate.progress = 0;
	}

	/**
	 * Reveal what is in the crates being gone through: one slot at a time, lowest first,
	 * `CRATES.revealSeconds` each. Returns the crates where a new slot was just started on.
	 */
	step(dt: number): Crate[] {
		const started: Crate[] = [];
		for (const crate of [...this.crates.values(), ...this.boxes.values()]) {
			if (crate.user === null || crate.hidden.size === 0) continue;
			if (crate.progress === 0) started.push(crate);
			crate.progress += dt;
			if (crate.progress < CRATES.revealSeconds) continue;
			crate.hidden.delete(Math.min(...crate.hidden));
			crate.progress = 0;
		}
		return started;
	}

	/** A crate as the player going through it is told it: nothing about what is still hidden. */
	view(crate: Crate): { slots: CrateSlot[]; reveal: number } {
		return {
			slots: crate.slots.map((stack, index) => (crate.hidden.has(index) ? 'hidden' : stack)),
			reveal: crate.hidden.size > 0 ? Math.min(1, crate.progress / CRATES.revealSeconds) : 0
		};
	}
}

/**
 * Opened by hand, without a key or a tool (a crate, a corpse, a locker; a jammed crate too, as its
 * jam isn't known until someone tries it): somewhere things put on purpose can always be got at.
 */
function byHand(crate: Crate): boolean {
	return crate.lock !== 'locked' && lootableOf(crate).open.some((way) => !way.tool && !way.key);
}

/**
 * Put in a crate on purpose (quest items, hints, the keys to the trunks): kept through a refill
 * and never pushed out.
 */
function placed(item: string): boolean {
	const def = ITEMS[item];
	return def?.quest === true || def?.kind === 'clue' || def?.unlocks === true;
}

/** How many fills one holds (a font), rolled per map; 0 for anything not filled from. */
function fillsOf(def: LootableDef, rng: Rng): number {
	if (!def.fill) return 0;
	const [least, most] = def.fill.fills;
	return least + Math.floor(rng.next() * (most - least + 1));
}
