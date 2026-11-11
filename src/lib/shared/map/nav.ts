import {
	capsuleFits,
	floorHeightAt,
	hasFloor,
	volumesAt,
	type CollisionWorld
} from './collision.ts';
import { CELL, LEVEL_HEIGHT, occupiedCells } from './grid.ts';
import type { MapLayout, PieceDef, Vec3 } from './types.ts';
import type { Stance } from '../player/types.ts';

/**
 * Navigation grid for creatures: walkable points on a 0.5 m lattice over every occupied cell,
 * connected to their neighbours when a body can get between them. Built once per map from the
 * collision world, so it follows stairs, rooms and walkways and avoids water and obstacles.
 * See docs/dev/creatures.md.
 */

export interface NavPoint {
	position: Vec3;
	neighbours: number[];
	/** Lowest posture needed here (crawls and squeezes need a creature to get down). */
	clearance: Stance;
	/** In water: wading or swimming. Paths avoid it unless there's no dry way round. */
	water: boolean;
}

export interface NavGrid {
	points: NavPoint[];
	/** "ix,iz" (lattice index) -> indices of points stacked at that spot (different floors). */
	columns: Map<string, number[]>;
}

/** Lattice spacing (m). Fine enough to sample doorway centre lines and narrow walkways. */
const SPACING = 0.5;
const PER_CELL = CELL / SPACING;
/** Body used to test walkability (the tallest creature, a little slimmer than its collider). */
const BODY_RADIUS = 0.28;
/** Body heights per posture, tallest first. */
const POSTURES: [Stance, number][] = [
	['stand', 1.7],
	['crouch', 1.15],
	['crawl', 0.65]
];
const STANCE_RANK: Record<Stance, number> = { stand: 0, crouch: 1, crawl: 2 };
/** Largest floor height change between neighbouring points (stairs ramp rises ~0.7 per metre). */
const MAX_STEP = 0.5;
/** Low lips (ramp edges, platform rims) the body steps over: walkability is tested from here up. */
const ANKLE = 0.35;
/** Path cost multiplier for water points. */
const WATER_COST = 4;

function lattice(v: number): number {
	return Math.round(v / SPACING);
}

function columnKey(ix: number, iz: number): string {
	return `${ix},${iz}`;
}

function inWater(world: CollisionWorld, p: Vec3): boolean {
	return volumesAt(world, [p[0], p[1] + 0.3, p[2]]).some((v) => v.kind === 'water');
}

/** The tallest posture that fits standing at p, or null if none does. */
function clearanceAt(world: CollisionWorld, p: Vec3): Stance | null {
	for (const [stance, height] of POSTURES) {
		// Low bodies can't lift as far off the floor and still be a capsule.
		const lift = Math.min(ANKLE, height - 2 * BODY_RADIUS - 0.01);
		if (capsuleFits(world, [p[0], p[1] + lift, p[2]], height - lift, BODY_RADIUS)) return stance;
	}
	return null;
}

/** The lower of two postures. */
export function lowerStance(a: Stance, b: Stance): Stance {
	return STANCE_RANK[a] >= STANCE_RANK[b] ? a : b;
}

export function buildNav(
	world: CollisionWorld,
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	/** A point known to be reachable (the start spawn); everything not connected to it is dropped. */
	root: Vec3
): NavGrid {
	const grid: NavGrid = { points: [], columns: new Map() };
	const seen = new Set<string>();
	for (const placement of layout.placements) {
		const piece = pieces[placement.piece];
		if (!piece) continue;
		for (const [cx, cz, level] of occupiedCells(piece, placement)) {
			const cellKey = `${cx},${cz},${level}`;
			if (seen.has(cellKey)) continue;
			seen.add(cellKey);
			const above = (level + 1) * LEVEL_HEIGHT - 0.2;
			const below = level * LEVEL_HEIGHT - 0.5;
			// Lattice points from the cell's low edge up to (not including) its high edge, so
			// neighbouring cells tile without duplicates and the centre line is always sampled.
			for (let i = 0; i < PER_CELL; i++) {
				for (let j = 0; j < PER_CELL; j++) {
					const x = (cx - 0.5) * CELL + i * SPACING;
					const z = (cz - 0.5) * CELL + j * SPACING;
					addColumn(grid, world, x, z, above, below);
				}
			}
		}
	}
	// Connect neighbours (8-way) when the step is small and a body fits halfway between.
	grid.points.forEach((point, index) => {
		const [x, y, z] = point.position;
		const ix = lattice(x);
		const iz = lattice(z);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dz = -1; dz <= 1; dz++) {
				if (!dx && !dz) continue;
				for (const other of grid.columns.get(columnKey(ix + dx, iz + dz)) ?? []) {
					if (other < index) continue;
					const q = grid.points[other].position;
					if (Math.abs(q[1] - y) > MAX_STEP) continue;
					const mx = (x + q[0]) / 2;
					const mz = (z + q[2]) / 2;
					const avg = (y + q[1]) / 2;
					// A midpoint on a seam between floor boxes has no single top face: probe around it.
					const my =
						floorHeightAt(world, mx, mz, Math.max(y, q[1]) + 0.3, Math.min(y, q[1]) - 0.3) ??
						(hasFloor(world, [mx, avg, mz], 0.25) ? avg : null);
					if (my === null || !clearanceAt(world, [mx, my, mz])) continue;
					point.neighbours.push(other);
					grid.points[other].neighbours.push(index);
				}
			}
		}
	});
	return reachableFrom(grid, nearestPoint(grid, root));
}

/** Adds a point for every walkable floor surface at (x, z) within a level, top down. */
function addColumn(
	grid: NavGrid,
	world: CollisionWorld,
	x: number,
	z: number,
	above: number,
	below: number
): void {
	const key = columnKey(lattice(x), lattice(z));
	for (
		let y = floorHeightAt(world, x, z, above, below);
		y !== null;
		y = floorHeightAt(world, x, z, y - 0.3, below)
	) {
		const floorY = y;
		const p: Vec3 = [x, floorY, z];
		const clearance = clearanceAt(world, p);
		if (!clearance) continue;
		const column = grid.columns.get(key) ?? [];
		// Two cells can sample the same floor (a piece spanning levels): keep one.
		if (column.some((i) => Math.abs(grid.points[i].position[1] - floorY) < 0.3)) continue;
		column.push(grid.points.length);
		grid.columns.set(key, column);
		grid.points.push({ position: p, neighbours: [], clearance, water: inWater(world, p) });
	}
}

/**
 * Keeps only the points reachable from `start`. Floors sampled on the roofs of lower pieces
 * (and other pockets nothing can walk into) form islands, which this drops.
 */
function reachableFrom(grid: NavGrid, start: number): NavGrid {
	if (start < 0) return { points: [], columns: new Map() };
	const remap = new Map<number, number>([[start, 0]]);
	const order = [start];
	for (let i = 0; i < order.length; i++) {
		for (const n of grid.points[order[i]].neighbours) {
			if (remap.has(n)) continue;
			remap.set(n, order.length);
			order.push(n);
		}
	}
	const out: NavGrid = { points: [], columns: new Map() };
	for (const old of order) {
		const { position, neighbours, clearance, water } = grid.points[old];
		out.points.push({
			position,
			neighbours: neighbours.map((n) => remap.get(n) ?? -1),
			clearance,
			water
		});
		const key = columnKey(lattice(position[0]), lattice(position[2]));
		const column = out.columns.get(key) ?? [];
		column.push(out.points.length - 1);
		out.columns.set(key, column);
	}
	return out;
}

/** The nav point nearest to a position (searching within `radius` metres), or -1. */
export function nearestPoint(grid: NavGrid, p: Vec3, radius = 2): number {
	const ix = lattice(p[0]);
	const iz = lattice(p[2]);
	const r = Math.ceil(radius / SPACING);
	let best = -1;
	let bestD = Infinity;
	for (let dx = -r; dx <= r; dx++) {
		for (let dz = -r; dz <= r; dz++) {
			for (const i of grid.columns.get(columnKey(ix + dx, iz + dz)) ?? []) {
				const q = grid.points[i].position;
				// Vertical distance counts extra so we don't snap to the floor above or below.
				const d = Math.hypot(q[0] - p[0], (q[1] - p[1]) * 3, q[2] - p[2]);
				if (d < bestD) {
					bestD = d;
					best = i;
				}
			}
		}
	}
	return best;
}

/** Binary min-heap of point indices keyed by f-score. */
class OpenSet {
	private items: number[] = [];
	private keys: number[] = [];

	get size(): number {
		return this.items.length;
	}

	push(item: number, key: number): void {
		this.items.push(item);
		this.keys.push(key);
		let i = this.items.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (this.keys[parent] <= this.keys[i]) break;
			this.swap(i, parent);
			i = parent;
		}
	}

	pop(): number {
		const top = this.items[0];
		const lastItem = this.items.pop() as number;
		const lastKey = this.keys.pop() as number;
		if (this.items.length) {
			this.items[0] = lastItem;
			this.keys[0] = lastKey;
			let i = 0;
			for (;;) {
				const l = i * 2 + 1;
				const r = l + 1;
				let m = i;
				if (l < this.items.length && this.keys[l] < this.keys[m]) m = l;
				if (r < this.items.length && this.keys[r] < this.keys[m]) m = r;
				if (m === i) break;
				this.swap(i, m);
				i = m;
			}
		}
		return top;
	}

	private swap(a: number, b: number): void {
		[this.items[a], this.items[b]] = [this.items[b], this.items[a]];
		[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
	}
}

/** A* over the grid. Returns the point positions from start to goal, or null. */
export function findPath(grid: NavGrid, from: number, to: number, maxNodes = 20000): Vec3[] | null {
	if (from < 0 || to < 0) return null;
	const goal = grid.points[to].position;
	const h = (i: number) => {
		const p = grid.points[i].position;
		return Math.hypot(p[0] - goal[0], p[1] - goal[1], p[2] - goal[2]);
	};
	const g = new Map<number, number>([[from, 0]]);
	const came = new Map<number, number>();
	const closed = new Set<number>();
	const open = new OpenSet();
	open.push(from, h(from));
	while (open.size && closed.size < maxNodes) {
		const current = open.pop();
		if (closed.has(current)) continue;
		if (current === to) {
			const path: Vec3[] = [];
			let at: number | undefined = current;
			while (at !== undefined) {
				path.unshift(grid.points[at].position);
				at = came.get(at);
			}
			return path;
		}
		closed.add(current);
		const p = grid.points[current].position;
		const base = g.get(current) ?? Infinity;
		for (const n of grid.points[current].neighbours) {
			if (closed.has(n)) continue;
			const q = grid.points[n].position;
			const step = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
			const tentative = base + (grid.points[n].water ? step * WATER_COST : step);
			if (tentative < (g.get(n) ?? Infinity)) {
				came.set(n, current);
				g.set(n, tentative);
				open.push(n, tentative + h(n));
			}
		}
	}
	return null;
}

/**
 * Distance (m, along the grid) from the nearest of `from` to every point; undefined where
 * unreachable. A breadth-first walk summing horizontal step lengths: close enough for spawning.
 */
export function gridDistances(grid: NavGrid, from: number[]): number[] {
	const distance: number[] = new Array(grid.points.length);
	const queue = from.filter((f) => f >= 0);
	for (const f of queue) distance[f] = 0;
	for (let i = 0; i < queue.length; i++) {
		const at = queue[i];
		const p = grid.points[at].position;
		for (const n of grid.points[at].neighbours) {
			if (distance[n] !== undefined) continue;
			const q = grid.points[n].position;
			distance[n] = distance[at] + Math.hypot(q[0] - p[0], q[2] - p[2]);
			queue.push(n);
		}
	}
	return distance;
}

/** Path length (m) of a list of points. */
export function pathLength(path: Vec3[]): number {
	let total = 0;
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1];
		const b = path[i];
		total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
	}
	return total;
}
