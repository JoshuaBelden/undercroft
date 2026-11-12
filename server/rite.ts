import type { RiteSpec } from '../src/lib/content/afflictions.ts';
import { ITEMS } from '../src/lib/content/items.ts';
import { carriesAll, revealed, riteSnapshot } from '../src/lib/shared/affliction/rite.ts';
import type { RiteSnapshot } from '../src/lib/shared/affliction/types.ts';
import { newStack, removeItem } from '../src/lib/shared/items/inventory.ts';
import { LEVEL_HEIGHT, cellKey, occupiedCells, worldCell } from '../src/lib/shared/map/grid.ts';
import { gridDistances, nearestPoint, type NavGrid } from '../src/lib/shared/map/nav.ts';
import type { MapKit, MapLayout, PieceDef, Vec3 } from '../src/lib/shared/map/types.ts';
import type { PlayerState } from '../src/lib/shared/player/types.ts';
import { Rng } from '../src/lib/shared/rng.ts';
import type { Crates } from './crates.ts';
import type { WorldItems } from './items.ts';

/**
 * The rite of one expedition: how many clues have been found (what players know), where it is
 * held, and whether a player can perform it. See docs/dev/rite.md.
 */
export class RiteDirector {
	/** Clues found, counting those the party already knew from earlier runs. */
	clues = 0;
	/** Cells of the room the rite is held in. */
	private cells: Set<string>;

	constructor(
		private spec: RiteSpec,
		layout: MapLayout,
		pieces: Record<string, PieceDef>
	) {
		this.cells = cellsOf(layout, pieces, spec.room);
	}

	/** Every clue has been found: nothing is hidden any more. */
	get complete(): boolean {
		return this.clues >= this.spec.clues;
	}

	/** A clue was picked up. Returns what it revealed, or null if there was nothing left to learn. */
	find(): { requirements: string[]; room: string | null } | null {
		if (this.complete) return null;
		const before = revealed(this.spec, this.clues);
		this.clues++;
		const after = revealed(this.spec, this.clues);
		return {
			requirements: this.spec.requirements.slice(before.slots, after.slots).map((r) => r.item),
			room: after.room && !before.room ? this.spec.room : null
		};
	}

	/** Start from what is already known (earlier runs, or an admin). */
	reveal(clues: number): void {
		this.clues = Math.max(this.clues, Math.min(this.spec.clues, Math.floor(clues)));
	}

	reset(): void {
		this.clues = 0;
	}

	snapshot(): RiteSnapshot {
		return riteSnapshot(this.spec, this.clues);
	}

	inRoom(position: Vec3): boolean {
		return this.cells.has(cellOf(position));
	}

	/** The holder: knows where, is there, and carries everything the rite needs. */
	canPerform(state: PlayerState): boolean {
		return (
			this.complete &&
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

/**
 * Put the rite's items and clues in the map (seeded by the map seed):
 *
 * - each required item lies in one of the major rooms, other than the rite's own, so there is
 *   somewhere recognisable to look for it;
 * - a required item marked `crate` is in one of the loot crates instead (or, in a map with no
 *   crates, in a major room like the others);
 * - clue copies are spread from near the start to far from it, outside the rite's room.
 */
export function scatterRite(
	spec: RiteSpec,
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit,
	nav: NavGrid,
	start: Vec3,
	seed: number,
	items: WorldItems,
	crates: Crates
): void {
	const rng = new Rng(seed ^ 0x51ce);
	const riteCells = cellsOf(layout, pieces, spec.room);
	const floor = nav.points
		.map((point, index) => ({ point, index }))
		.filter(({ point }) => point.clearance === 'stand' && !point.water);
	const place = (item: string, spots: typeof floor): void => {
		if (!ITEMS[item] || spots.length === 0) return;
		const [x, y, z] = rng.pick(spots).point.position;
		items.place(newStack(item), [x, y, z], rng.next() * Math.PI * 2);
	};

	const distance = gridDistances(nav, [nearestPoint(nav, start)]);
	if (spec.atStart) {
		// Laid out a few steps from the start, each on its own spot.
		const near = floor
			.filter(({ index }) => distance[index] >= 1.5 && distance[index] <= 4)
			.sort((a, b) => distance[a.index] - distance[b.index]);
		const used: Vec3[] = [];
		const lay = (item: string): void => {
			const apart = near.filter(({ point }) =>
				used.every((u) => Math.hypot(u[0] - point.position[0], u[2] - point.position[2]) >= 1)
			);
			const spot = (apart.length ? apart : near)[0];
			if (!ITEMS[item] || !spot) return;
			used.push(spot.point.position);
			const [x, y, z] = spot.point.position;
			items.place(newStack(item), [x, y, z], rng.next() * Math.PI * 2);
		};
		for (let i = 0; i < spec.clues; i++) lay('clue');
		for (const { item, count, crate } of spec.requirements) {
			for (let i = 0; i < count; i++) {
				// One kept in a crate is in the crate nearest the start.
				if (crate && ITEMS[item] && crates.stow(newStack(item), rng, true)) continue;
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
	for (const { item, count, crate } of spec.requirements) {
		for (let i = 0; i < count; i++) {
			if (crate && ITEMS[item] && crates.stow(newStack(item), rng)) continue;
			const cells = majors.length ? cellsOf(layout, pieces, rng.pick(majors)) : null;
			const inRoom = cells ? floor.filter(({ point }) => cells.has(cellOf(point.position))) : [];
			place(item, inRoom.length ? inRoom : floor);
		}
	}

	const reachable = floor.filter(
		({ point, index }) => distance[index] !== undefined && !riteCells.has(cellOf(point.position))
	);
	const far = reachable.reduce((most, { index }) => Math.max(most, distance[index]), 0);
	const copies = spec.clues * spec.clueCopies;
	for (let i = 0; i < copies; i++) {
		// Bands from 15% to 85% of the way to the farthest point, one copy in each.
		const lo = far * (0.15 + (0.7 * i) / copies);
		const hi = far * (0.15 + (0.7 * (i + 1)) / copies);
		const band = reachable.filter(({ index }) => distance[index] >= lo && distance[index] <= hi);
		place('clue', band.length ? band : reachable);
	}
}
