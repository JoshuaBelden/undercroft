import type { RiteSpec } from '../src/lib/content/afflictions.ts';
import { ITEMS } from '../src/lib/content/items.ts';
import { carriesAll, revealed, riteSnapshot } from '../src/lib/shared/affliction/rite.ts';
import type { RiteSnapshot } from '../src/lib/shared/affliction/types.ts';
import { newStack, removeItem } from '../src/lib/shared/items/inventory.ts';
import type { CollisionWorld } from '../src/lib/shared/map/collision.ts';
import { LEVEL_HEIGHT, cellKey, occupiedCells, worldCell } from '../src/lib/shared/map/grid.ts';
import { gridDistances, nearestPoint, type NavGrid } from '../src/lib/shared/map/nav.ts';
import type { MapKit, MapLayout, PieceDef, Vec3 } from '../src/lib/shared/map/types.ts';
import type { PlayerState } from '../src/lib/shared/player/types.ts';
import { Rng } from '../src/lib/shared/rng.ts';
import type { Crates } from './crates.ts';
import {
	crateSpots,
	floorPoints,
	furnitureSpots,
	placeHints,
	wallSpots,
	type FloorPoint
} from './hints.ts';
import type { WorldItems } from './items.ts';
import { log } from './log.ts';

/**
 * The rite of one expedition: how many hints have been found (what players know), where it is
 * held, whether a player can perform it, and whether it has been. See docs/dev/rite.md.
 */
export class RiteDirector {
	/** Hints found, counting those the party already knew from earlier runs. */
	clues = 0;
	/** The rite has been performed in this expedition. */
	resolved = false;
	/** Cells of the room the rite is held in. */
	private cells: Set<string>;

	constructor(
		private spec: RiteSpec,
		layout: MapLayout,
		pieces: Record<string, PieceDef>
	) {
		this.cells = cellsOf(layout, pieces, spec.room);
	}

	/** Every hint has been found: nothing is hidden any more. */
	get complete(): boolean {
		return this.clues >= this.spec.clues.length;
	}

	/** The room has been revealed (by its hint, or by finding them all). */
	get roomKnown(): boolean {
		return revealed(this.spec, this.clues).room;
	}

	/**
	 * A hint item was read: the next hint is learned, whichever copy it was. Returns what it says
	 * and what it revealed, or null if there was nothing left to learn.
	 */
	find(): { text: string; requirements: string[]; room: string | null } | null {
		if (this.complete) return null;
		const before = revealed(this.spec, this.clues);
		this.clues++;
		const after = revealed(this.spec, this.clues);
		return {
			text: after.hints[after.hints.length - 1] ?? '',
			requirements: this.spec.requirements
				.filter((_, i) => after.slots[i] && !before.slots[i])
				.map((r) => r.item),
			room: after.room && !before.room ? this.spec.room : null
		};
	}

	/** Start from what is already known (earlier runs, or an admin). */
	reveal(clues: number): void {
		this.clues = Math.max(this.clues, Math.min(this.spec.clues.length, Math.floor(clues)));
	}

	reset(): void {
		this.clues = 0;
	}

	snapshot(): RiteSnapshot {
		return riteSnapshot(this.spec, this.clues, this.resolved);
	}

	inRoom(position: Vec3): boolean {
		return this.cells.has(cellOf(position));
	}

	/** The holder: knows where, is there, and carries everything the rite needs. */
	canPerform(state: PlayerState): boolean {
		return (
			!this.resolved &&
			this.roomKnown &&
			this.inRoom(state.position) &&
			carriesAll(state.inventory, this.spec.requirements)
		);
	}

	/** The rite uses up what it needed. */
	take(state: PlayerState): void {
		for (const { item, count } of this.spec.requirements) removeItem(state.inventory, item, count);
	}
}

/** Cells (as cell keys) each placement of a piece covers. */
function cellsOf(layout: MapLayout, pieces: Record<string, PieceDef>, id: string): Set<string> {
	const cells = new Set<string>();
	for (const placement of layout.placements) {
		const piece = pieces[placement.piece];
		if (placement.piece !== id || !piece) continue;
		for (const [x, z, level] of occupiedCells(piece, placement)) cells.add(cellKey(x, z, level));
	}
	return cells;
}

function cellOf(position: Vec3): string {
	const [x, z] = worldCell(position[0], position[2]);
	return cellKey(x, z, Math.floor((position[1] + 0.5) / LEVEL_HEIGHT));
}

/** Everything `scatterRite` needs to know about the map. */
export interface RiteMap {
	layout: MapLayout;
	pieces: Record<string, PieceDef>;
	kit: MapKit;
	world: CollisionWorld;
	nav: NavGrid;
	start: Vec3;
	seed: number;
}

/**
 * Put the rite's items and hints in the map (seeded by the map seed):
 *
 * - a required item with `place: 'crate'` is in one of the loot crates (in a map with no crates,
 *   in a major room); one with `place: 'room'` lies in a major room other than the rite's own;
 *   one with no `place` isn't put anywhere (players bring it). `withheld` items (a quest item
 *   someone in the party already owns) are left out.
 * - hint copies are spread from near the start to far from it, outside the rite's room, in
 *   crates, on corpses, on walls and on furniture: never on a floor (see server/hints.ts).
 */
export function scatterRite(
	spec: RiteSpec,
	map: RiteMap,
	items: WorldItems,
	crates: Crates,
	withheld: ReadonlySet<string>
): void {
	const { layout, pieces, kit, world, nav, start, seed } = map;
	const rng = new Rng(seed ^ 0x51ce);
	const riteCells = cellsOf(layout, pieces, spec.room);
	const distance = gridDistances(nav, [nearestPoint(nav, start)]);
	const floor = floorPoints(nav, distance);
	const wanted = spec.requirements.filter((r) => r.place && ITEMS[r.item] && !withheld.has(r.item));

	if (spec.atStart) {
		// Laid out a few steps from the start, each on its own spot; hints in the nearest crate.
		const near = floor
			.filter((p) => p.distance >= 1.5 && p.distance <= 4)
			.sort((a, b) => a.distance - b.distance);
		const used: Vec3[] = [];
		const lay = (item: string): void => {
			const apart = near.filter((p) =>
				used.every((u) => Math.hypot(u[0] - p.position[0], u[2] - p.position[2]) >= 1)
			);
			const spot = (apart.length ? apart : near)[0];
			if (!spot) return;
			used.push(spot.position);
			items.place(newStack(item), [...spot.position], rng.next() * Math.PI * 2);
		};
		for (let i = 0; i < spec.clues.length; i++) crates.stow(newStack('clue'), rng, true);
		for (const { item, count, place } of wanted) {
			for (let i = 0; i < count; i++) {
				if (place === 'crate' && crates.stow(newStack(item), rng, true)) continue;
				lay(item);
			}
		}
		return;
	}

	const majors = [
		...new Set(
			layout.placements
				.map((placement) => placement.piece)
				.filter((id) => kit[id]?.role === 'major' && id !== spec.room)
		)
	];
	const pick = (spots: FloorPoint[]): FloorPoint | undefined =>
		spots.length ? rng.pick(spots) : undefined;
	for (const { item, count, place } of wanted) {
		for (let i = 0; i < count; i++) {
			if (place === 'crate' && crates.stow(newStack(item), rng)) continue;
			const cells = majors.length ? cellsOf(layout, pieces, rng.pick(majors)) : null;
			const inRoom = cells ? floor.filter((p) => cells.has(cellOf(p.position))) : [];
			const spot = pick(inRoom.length ? inRoom : floor);
			if (spot) items.place(newStack(item), [...spot.position], rng.next() * Math.PI * 2);
		}
	}

	// Hints: anywhere reachable outside the rite's room; on walls only in the major rooms.
	const outside = (position: Vec3): boolean => !riteCells.has(cellOf(position));
	const majorCells = new Set(majors.flatMap((id) => [...cellsOf(layout, pieces, id)]));
	const reachable = floor.filter((p) => outside(p.position));
	const spots = [
		...crateSpots(crates, outside),
		...wallSpots(
			world,
			reachable.filter((p) => majorCells.has(cellOf(p.position)))
		),
		...furnitureSpots(world, reachable)
	];
	const far = reachable.reduce((most, p) => Math.max(most, p.distance), 0);
	const copies = spec.clues.length * spec.clueCopies;
	const placed = placeHints(spots, copies, far, rng, items, crates);
	if (placed < copies) log.warn(`Only ${placed} of ${copies} hints found a place in this map`);
}
