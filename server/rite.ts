import type { RiteSpec } from '../src/lib/content/afflictions.ts';
import { ITEMS } from '../src/lib/content/items.ts';
import {
	carriesAll,
	revealed,
	riteSnapshot,
	takeForRite
} from '../src/lib/shared/affliction/rite.ts';
import type { RiteSnapshot } from '../src/lib/shared/affliction/types.ts';
import { newStack } from '../src/lib/shared/items/inventory.ts';
import type { CollisionWorld } from '../src/lib/shared/map/collision.ts';
import {
	LEVEL_HEIGHT,
	cellKey,
	occupiedCells,
	toWorld,
	worldCell
} from '../src/lib/shared/map/grid.ts';
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
 * held, whether a player can perform it, whether it has been (summoning the manifestation), and
 * whether what it summoned has been banished (resolving it). See docs/dev/rite.md.
 */
export class RiteDirector {
	/** Hints found, counting those the party already knew from earlier runs. */
	clues = 0;
	/** The rite has been performed in this expedition: it summoned the manifestation. */
	performed = false;
	/** What it summoned has been banished: the Affliction is resolved. */
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
		return riteSnapshot(this.spec, this.clues, this.performed, this.resolved);
	}

	/** Cells (cell keys) of the room it is held in. */
	get roomCells(): ReadonlySet<string> {
		return this.cells;
	}

	inRoom(position: Vec3): boolean {
		return this.cells.has(cellOf(position));
	}

	/** The holder: knows where, is there, and carries everything the rite needs. */
	canPerform(state: PlayerState): boolean {
		return (
			!this.performed &&
			this.roomKnown &&
			this.inRoom(state.position) &&
			carriesAll(state.inventory, this.spec.requirements)
		);
	}

	/** The rite uses up what it needed. */
	take(state: PlayerState): void {
		for (const { item, count } of this.spec.requirements) takeForRite(state.inventory, item, count);
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

export function cellOf(position: Vec3): string {
	const [x, z] = worldCell(position[0], position[2]);
	return cellKey(x, z, Math.floor((position[1] + 0.5) / LEVEL_HEIGHT));
}

/**
 * The altar of a rite's room: its `altar-0` marker (on the altar's top). A room without one: the
 * furniture top (see `furnitureSpots`) within reach of where the rite is performed (the room's first
 * `rite-<n>` marker), nearest it. Null if the room isn't in the map or has nothing there to lay a
 * thing on. Never a crate or a corpse.
 */
export function altarSpot(room: string, map: RiteMap, floor: FloorPoint[]): Vec3 | null {
	const piece = map.pieces[room];
	const placement = map.layout.placements.find((p) => p.piece === room);
	// The room says where: its altar-0 marker (the Gloaming Chapel's, on the altar's top).
	const altar = piece?.altars?.[0];
	if (placement && altar) return toWorld(placement, altar);
	const marker = piece?.rites[0];
	if (!placement || !marker) return null;
	const at = toWorld(placement, marker);
	const standing = floor
		.filter((p) => Math.abs(p.position[1] - at[1]) < 1)
		.sort((a, b) => flat(a.position, at) - flat(b.position, at))
		.slice(0, 4);
	const tops = furnitureSpots(map.world, standing).sort(
		(a, b) => flat(a.position, at) - flat(b.position, at)
	);
	return tops[0]?.position ?? null;
}

function flat(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[2] - b[2]);
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
	const distance = gridDistances(nav, [nearestPoint(nav, start)], true);
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
			if (place === 'altar') {
				const top = altarSpot(spec.room, map, floor);
				if (top) {
					items.place(newStack(item), [top[0], top[1] + 0.05, top[2]], rng.next() * Math.PI * 2);
					continue;
				}
			}
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
