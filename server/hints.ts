import { HINTS, type HintSpotKind } from '../src/lib/content/hints.ts';
import { newStack } from '../src/lib/shared/items/inventory.ts';
import {
	boxesNear,
	boxTop,
	segmentHit,
	type CollisionWorld,
	type WorldBox
} from '../src/lib/shared/map/collision.ts';
import type { NavGrid } from '../src/lib/shared/map/nav.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import type { Rng } from '../src/lib/shared/rng.ts';
import type { Crates } from './crates.ts';
import type { WorldItems } from './items.ts';

/**
 * Where hint items go: crates, corpses, walls at eye level in major rooms, and furniture tops.
 * Never a floor. See docs/dev/rite.md.
 */

/** A place a hint can be put. */
export type HintSpot =
	| { kind: 'crate' | 'corpse'; crate: string; position: Vec3; distance: number }
	| { kind: 'wall'; position: Vec3; normal: Vec3; distance: number }
	| { kind: 'furniture'; position: Vec3; distance: number };

/** Standing, dry nav points, with their distance along the floor from the start. */
export interface FloorPoint {
	index: number;
	position: Vec3;
	distance: number;
}

const DIRECTIONS: Vec3[] = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 0, 1],
	[0, 0, -1]
];

/** Crates and corpses (those `allowed`), with their distance from the start. */
export function crateSpots(crates: Crates, allowed: (position: Vec3) => boolean): HintSpot[] {
	return crates
		.list()
		.filter(({ crate, fromStart }) => Number.isFinite(fromStart) && allowed(crate.position))
		.map(({ crate, fromStart }) => ({
			kind: crate.kind === 'corpse' ? 'corpse' : 'crate',
			crate: crate.id,
			position: crate.position,
			distance: fromStart
		}));
}

/**
 * Flat walls at eye level, seen from `points` (standing nav points in major rooms): a ray out
 * from eye height and four more around it must all hit at the same distance.
 */
export function wallSpots(world: CollisionWorld, points: FloorPoint[]): HintSpot[] {
	const w = HINTS.wall;
	const spots: HintSpot[] = [];
	for (const point of points) {
		const [x, y, z] = point.position;
		const eye: Vec3 = [x, y + w.height, z];
		for (const dir of DIRECTIONS) {
			const hit = reachTo(world, eye, dir, w.reach);
			if (hit === null || hit < w.near) continue;
			const side: Vec3 = [-dir[2], 0, dir[0]];
			const flat = [
				[side, w.spread],
				[side, -w.spread],
				[[0, 1, 0] as Vec3, w.spread],
				[[0, 1, 0] as Vec3, -w.spread]
			].every(([axis, by]) => {
				const a = axis as Vec3;
				const d = by as number;
				const from: Vec3 = [eye[0] + a[0] * d, eye[1] + a[1] * d, eye[2] + a[2] * d];
				const other = reachTo(world, from, dir, w.reach);
				return other !== null && Math.abs(other - hit) <= w.flatness;
			});
			if (!flat) continue;
			const out = hit - w.standoff;
			spots.push({
				kind: 'wall',
				position: [eye[0] + dir[0] * out, eye[1], eye[2] + dir[2] * out],
				normal: [-dir[0], 0, -dir[2]],
				distance: point.distance + hit
			});
		}
	}
	return spots;
}

/**
 * Furniture tops: boxes no bigger than furniture, standing on the floor, with a top at table or
 * coffin height that is clear above and that someone standing at one of `points` can reach.
 */
export function furnitureSpots(world: CollisionWorld, points: FloorPoint[]): HintSpot[] {
	const f = HINTS.furniture;
	const spots = new Map<WorldBox, HintSpot>();
	for (const point of points) {
		const [x, y, z] = point.position;
		const near = boxesNear(
			world,
			[x - f.reach - f.maxHalf, y, z - f.reach - f.maxHalf],
			[x + f.reach + f.maxHalf, y + f.maxTop, z + f.reach + f.maxHalf]
		);
		for (const box of near) {
			if (spots.has(box) || box.half.some((h) => h > f.maxHalf)) continue;
			const up = box.axes.findIndex((axis) => Math.abs(axis[1]) > 0.99);
			if (up === -1) continue;
			const top = boxTop(box);
			const foot = top - box.half[up] * 2;
			if (top - y < f.minTop || top - y > f.maxTop || foot - y > f.footing) continue;
			// The spot on top nearest whoever stands here, kept in from the edges.
			const spot: Vec3 = [box.center[0], top, box.center[2]];
			const d: Vec3 = [x - box.center[0], 0, z - box.center[2]];
			let fits = true;
			for (let k = 0; k < 3; k++) {
				if (k === up) continue;
				const axis = box.axes[k];
				const room = box.half[k] - f.inset;
				if (room < 0.05) fits = false;
				const along = Math.max(-room, Math.min(room, d[0] * axis[0] + d[2] * axis[2]));
				spot[0] += axis[0] * along;
				spot[2] += axis[2] * along;
			}
			if (!fits || Math.hypot(spot[0] - x, spot[2] - z) > f.reach) continue;
			const above: Vec3 = [spot[0], top + 0.05, spot[2]];
			const clear = segmentHit(world, above, [spot[0], top + f.headroom, spot[2]]) === null;
			if (!clear) continue;
			spots.set(box, { kind: 'furniture', position: spot, distance: point.distance });
		}
	}
	return [...spots.values()];
}

/**
 * Put `copies` hints in `spots`: one in each distance band from `HINTS.bands[0]` to
 * `HINTS.bands[1]` of the way to `far`, taking the kinds in `HINTS.order` in turn. Each falls
 * back to any kind in its band, then anywhere left. Returns how many were placed.
 */
export function placeHints(
	spots: HintSpot[],
	copies: number,
	far: number,
	rng: Rng,
	items: WorldItems,
	crates: Crates
): number {
	const used: Vec3[] = [];
	const usedCrates = new Set<string>();
	const free = (spot: HintSpot): boolean =>
		!(('crate' in spot && usedCrates.has(spot.crate)) || near(used, spot.position));
	let placed = 0;
	const [from, to] = HINTS.bands;
	for (let i = 0; i < copies; i++) {
		const lo = far * (from + ((to - from) * i) / copies);
		const hi = far * (from + ((to - from) * (i + 1)) / copies);
		const kind: HintSpotKind = HINTS.order[i % HINTS.order.length];
		const open = spots.filter(free);
		const band = open.filter((spot) => spot.distance >= lo && spot.distance <= hi);
		const choices = [band.filter((spot) => spot.kind === kind), band, open].find((c) => c.length);
		if (!choices) break;
		const spot = rng.pick(choices);
		used.push(spot.position);
		if ('crate' in spot) {
			usedCrates.add(spot.crate);
			crates.stowIn(spot.crate, newStack('clue'));
		} else if (spot.kind === 'wall') {
			items.mount(newStack('clue'), spot.position, spot.normal);
		} else {
			items.place(newStack('clue'), [spot.position[0], spot.position[1] + 0.05, spot.position[2]]);
		}
		placed++;
	}
	return placed;
}

/** Distance (m) along `dir` to the first collider, or null within `reach`. */
function reachTo(world: CollisionWorld, from: Vec3, dir: Vec3, reach: number): number | null {
	const t = segmentHit(world, from, [
		from[0] + dir[0] * reach,
		from[1] + dir[1] * reach,
		from[2] + dir[2] * reach
	]);
	return t === null || t <= 0 ? null : t * reach;
}

function near(used: Vec3[], p: Vec3): boolean {
	return used.some(
		(u) => Math.hypot(u[0] - p[0], u[2] - p[2]) < HINTS.spacing && Math.abs(u[1] - p[1]) < 2
	);
}

/** The navigation grid's standing, dry points, with their distance from the start. */
export function floorPoints(nav: NavGrid, distance: number[]): FloorPoint[] {
	return nav.points.flatMap((point, index) =>
		point.clearance === 'stand' && !point.water && distance[index] !== undefined
			? [{ index, position: point.position, distance: distance[index] }]
			: []
	);
}
