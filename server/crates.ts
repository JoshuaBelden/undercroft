import { ITEMS } from '../src/lib/content/items.ts';
import { CRATES } from '../src/lib/content/loot.ts';
import type { Slots } from '../src/lib/shared/items/inventory.ts';
import { rollCrate } from '../src/lib/shared/items/loot.ts';
import { lookedAtCrate } from '../src/lib/shared/items/pickup.ts';
import type { CrateSlot, CratesSnapshot } from '../src/lib/shared/items/types.ts';
import type { CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { gridDistances, nearestPoint, type NavGrid } from '../src/lib/shared/map/nav.ts';
import type { CratePlacement, Vec3 } from '../src/lib/shared/map/types.ts';
import type { ItemStack } from '../src/lib/shared/player/types.ts';
import { Rng } from '../src/lib/shared/rng.ts';

/**
 * Loot crates. Where they stand comes with the map (`layout.crates`); this holds what is in each,
 * what of it has been revealed, and who is going through it. One player at a time. Things are
 * revealed one slot at a time while someone has the crate open. See docs/dev/items.md.
 */

export interface Crate {
	id: string;
	position: Vec3;
	slots: Slots;
	/** Slots holding something nobody has seen yet. They can't be touched. */
	hidden: Set<number>;
	/** Player going through it. */
	user: string | null;
	/** Opened at least once: its lid stays up. */
	opened: boolean;
	/** Seconds spent on the slot being revealed. Lost when the crate is closed. */
	progress: number;
}

export class Crates {
	private crates = new Map<string, Crate>();
	/** How deep each crate is: 0 at the start, 1 at the farthest point of the map. */
	private depth = new Map<string, number>();
	/** How far each crate is from the start along the floor (m). */
	private fromStart = new Map<string, number>();
	/** Counts fills, so refilling (admin) gives something new. */
	private fills = 0;

	constructor(
		private world: CollisionWorld,
		placements: CratePlacement[],
		nav: NavGrid,
		start: Vec3,
		private seed: number
	) {
		const distance = gridDistances(nav, [nearestPoint(nav, start)]);
		const far = distance.reduce((most, d) => Math.max(most, d ?? 0), 0);
		for (const { id, position } of placements) {
			const d = distance[nearestPoint(nav, position)];
			this.depth.set(id, far > 0 && d !== undefined ? d / far : 0);
			this.fromStart.set(id, d ?? Infinity);
			this.crates.set(id, {
				id,
				position,
				slots: [],
				hidden: new Set(),
				user: null,
				opened: false,
				progress: 0
			});
		}
		this.fill();
	}

	/**
	 * Shut every crate and fill it again, hidden. Seeded by the map seed. Quest items still in a
	 * crate stay in it: there is only one of each, and the roll would lose it.
	 */
	fill(): void {
		const rng = new Rng(this.seed ^ 0x10075 ^ Math.imul(this.fills++, 0x9e3779b9));
		for (const crate of this.crates.values()) {
			const kept = crate.slots.filter((stack) => stack !== null && ITEMS[stack.item]?.quest);
			crate.slots = rollCrate(this.depth.get(crate.id) ?? 0, rng);
			crate.hidden = new Set(crate.slots.flatMap((stack, index) => (stack ? [index] : [])));
			crate.user = null;
			crate.opened = false;
			crate.progress = 0;
			for (const stack of kept) if (stack) this.put(crate, stack);
		}
	}

	/**
	 * Put something in one of the map's crates, on top of what the crate rolled (a rite's item).
	 * `nearStart` picks the crate nearest the start; otherwise any, by `rng`.
	 * Returns false if the map has no crate to put it in.
	 */
	stow(stack: ItemStack, rng: Rng, nearStart = false): boolean {
		const all = [...this.crates.values()];
		if (all.length === 0) return false;
		const distance = (crate: Crate): number => this.fromStart.get(crate.id) ?? Infinity;
		const crate = nearStart
			? all.reduce((best, c) => (distance(c) < distance(best) ? c : best))
			: rng.pick(all);
		this.put(crate, stack);
		return true;
	}

	/**
	 * Add a stack to a crate, hidden, after everything else in it so it is the last revealed. A
	 * full crate loses its commonest thing (the first slot) to make room.
	 */
	private put(crate: Crate, stack: ItemStack): void {
		const held = crate.slots.filter((s) => s !== null);
		if (held.length >= crate.slots.length) held.shift();
		held.push(stack);
		crate.slots = crate.slots.map((_, index) => held[index] ?? null);
		crate.hidden = new Set(held.map((_, index) => index));
	}

	get(id: string): Crate | null {
		return this.crates.get(id) ?? null;
	}

	snapshot(): CratesSnapshot {
		const all = [...this.crates.values()];
		return {
			open: all.filter((c) => c.opened).map((c) => c.id),
			busy: all.filter((c) => c.user !== null).map((c) => c.id)
		};
	}

	/** The crate a player is looking at within reach, or null (see lookedAtCrate). */
	lookedAt(eye: Vec3, look: Vec3): Crate | null {
		return lookedAtCrate(this.world, eye, look, this.crates.values());
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
		for (const crate of this.crates.values()) {
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
