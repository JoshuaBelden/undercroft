import { FALSE_WALLS, RUBBLE_WALLS, WEBS } from '../../content/map/walls.ts';
import { Rng } from '../rng.ts';
import { segmentHit, type CollisionWorld } from './collision.ts';
import { pieceLinks } from './debug.ts';
import {
	CELL,
	EDGE_DIR,
	LEVEL_HEIGHT,
	OPPOSITE,
	rotateEdge,
	toWorld,
	worldSocket,
	type WorldSocket
} from './grid.ts';
import type { Edge, MapKit, MapLayout, PieceDef, Placement, Vec3, WallPlacement } from './types.ts';

/**
 * False walls (docs/dev/map-generation.md#false-walls). A few openings that lead into a side
 * passage, the only way into it, are walled up with the same cap that seals any unused opening,
 * so from the outside it is a dead end like the rest. Only passages of plain connectors qualify:
 * never a room on the route, a stair or a rope drop. Seeded by the map seed.
 */
export function placeWalls(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit,
	seed: number
): WallPlacement[] {
	const rng = new Rng(seed ^ 0xfa15e);
	const links = pieceLinks(layout, pieces);
	const plain = (index: number): boolean => {
		const entry = kit[layout.placements[index].piece];
		return (
			(entry?.role === 'connector' || entry?.role === 'end') && !entry.descends && !entry.needsRope
		);
	};
	const [fewest, most] = FALSE_WALLS.pieces;
	// Every opening that is the only way into what lies beyond it (a bridge, from the start).
	const found: { from: number; to: number; beyond: Set<number> }[] = [];
	const reached = reach(links, null);
	for (let a = 0; a < links.length; a++) {
		for (const b of links[a]) {
			const beyond = cutOff(links, reached, a, b);
			if (!beyond || beyond.size < fewest || beyond.size > most) continue;
			if (![...beyond].every(plain)) continue;
			if (![...beyond].some((i) => (pieces[layout.placements[i].piece]?.crates.length ?? 0) > 0))
				continue;
			found.push({ from: a, to: b, beyond });
		}
	}
	const caps = Object.entries(kit).filter(([name, entry]) => entry.role === 'cap' && pieces[name]);
	const walls: WallPlacement[] = [];
	const hidden = new Set<number>();
	// False walls first, then rubble, then webs, each from the side passages left.
	const kinds: WallPlacement['kind'][] = [
		...Array.from({ length: FALSE_WALLS.count }, () => undefined),
		...Array.from({ length: RUBBLE_WALLS.count }, () => 'rubble' as const),
		...Array.from({ length: WEBS.count }, () => 'web' as const)
	];
	for (const { from, to, beyond } of rng.shuffle(found)) {
		if (walls.length >= kinds.length) break;
		// Not inside, or around, a passage already hidden.
		if (hidden.has(from) || [...beyond].some((i) => hidden.has(i))) continue;
		const socket = between(layout, pieces, from, to);
		const cap = socket && caps.find(([, entry]) => entry.seals === socket.type)?.[0];
		if (!socket || !cap) continue;
		const kind = kinds[walls.length];
		walls.push({
			id: `w${walls.length + 1}`,
			...capAt(cap, socket, layout.placements[from].tier),
			...(kind ? { kind } : {})
		});
		for (const i of beyond) hidden.add(i);
	}
	return walls;
}

/**
 * A training map's walls (Rumors): across the vault's side arches, each to a dead end, a web and
 * then a fall of rubble, to practise on. Ids follow the false walls' (`w1`...).
 */
export function trainingWalls(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit,
	vault: string
): WallPlacement[] {
	const from = layout.placements.findIndex((p) => p.piece === vault);
	if (from < 0) return [];
	const links = pieceLinks(layout, pieces);
	const caps = Object.entries(kit).filter(([name, entry]) => entry.role === 'cap' && pieces[name]);
	const kinds: WallPlacement['kind'][] = ['web', 'rubble'];
	const walls: WallPlacement[] = [];
	for (const to of [...links[from]].sort((a, b) => a - b)) {
		if (walls.length >= kinds.length) break;
		if (kit[layout.placements[to].piece]?.role !== 'end') continue;
		const socket = between(layout, pieces, from, to);
		const cap = socket && caps.find(([, entry]) => entry.seals === socket.type)?.[0];
		if (!socket || !cap) continue;
		walls.push({
			id: `w${walls.length + 1}`,
			...capAt(cap, socket, layout.placements[from].tier),
			kind: kinds[walls.length]
		});
	}
	return walls;
}

/**
 * What can no longer be reached from the start (placement 0) without the link from `a` to `b`,
 * when that is everything on `b`'s side of it; null when `b` is still reached some other way.
 */
function cutOff(
	links: Set<number>[],
	reached: Set<number>,
	a: number,
	b: number
): Set<number> | null {
	if (!reached.has(a) || !reached.has(b)) return null;
	const seen = reach(links, [a, b]);
	if (!seen.has(a) || seen.has(b)) return null;
	return new Set([...reached].filter((i) => !seen.has(i)));
}

/** Placements linked to the start (placement 0), leaving out the link without. */
function reach(links: Set<number>[], without: [number, number] | null): Set<number> {
	const [a, b] = without ?? [-1, -1];
	const seen = new Set<number>([0]);
	const queue = [0];
	while (queue.length) {
		const at = queue.pop()!;
		for (const next of links[at]) {
			if ((at === a && next === b) || (at === b && next === a) || seen.has(next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}
	return seen;
}

/** The socket of placement `a` that opens into placement `b`. */
function between(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	a: number,
	b: number
): WorldSocket | null {
	const pa = layout.placements[a];
	const pb = layout.placements[b];
	const da = pieces[pa.piece];
	const db = pieces[pb.piece];
	if (!da || !db) return null;
	const theirs = db.sockets.map((s) => worldSocket(db, pb, s));
	for (const s of da.sockets) {
		const mine = worldSocket(da, pa, s);
		const [dx, dz] = EDGE_DIR[mine.edge];
		const across = theirs.find(
			(t) =>
				t.type === mine.type &&
				t.level === mine.level &&
				t.edge === OPPOSITE[mine.edge] &&
				t.cell[0] === mine.cell[0] + dx &&
				t.cell[1] === mine.cell[1] + dz
		);
		if (across) return mine;
	}
	return null;
}

/** A cap sealing `socket` from its own side, placed the way the generator places caps. */
function capAt(piece: string, socket: WorldSocket, tier: number): Placement {
	const [ex, ez] = EDGE_DIR[socket.edge];
	// Caps are modelled facing north with their origin on the opening.
	const rotation = [0, 1, 2, 3].find((r) => rotateEdge('n', r) === socket.edge) ?? 0;
	return {
		piece,
		position: [
			(socket.cell[0] + ex / 2) * CELL,
			socket.level * LEVEL_HEIGHT,
			(socket.cell[1] + ez / 2) * CELL
		],
		rotation,
		tier
	};
}

/** A wall at the end of a dead end, where a crowbar can be tried. */
export interface PrySpot {
	/** The point on the wall that is looked at, world space. */
	position: Vec3;
	/** The false wall it is, or null for solid rock. */
	wall: string | null;
}

/**
 * Every wall a crowbar can be tried on: each cap (a sealed opening), each dead end's fall of
 * rock, and each false wall. Shared, so the client prompts for exactly what the server pries.
 */
export function prySpots(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit
): PrySpot[] {
	const spots: PrySpot[] = [];
	const onCap = (placement: Placement, wall: string | null): void => {
		const edge = rotateEdge('n', placement.rotation) as Edge;
		const [ex, ez] = EDGE_DIR[edge];
		const [x, y, z] = placement.position;
		spots.push({
			position: [x - ex * FALSE_WALLS.depth, y + FALSE_WALLS.height, z - ez * FALSE_WALLS.depth],
			wall
		});
	};
	for (const placement of layout.placements) {
		const role = kit[placement.piece]?.role;
		if (role === 'cap') onCap(placement, null);
		if (role !== 'end') continue;
		for (const rubble of pieces[placement.piece]?.rubble ?? []) {
			const [x, y, z] = toWorld(placement, rubble);
			spots.push({ position: [x, y + FALSE_WALLS.height * 0.7, z], wall: null });
		}
	}
	// Only false walls are pried: rubble and webs are what they look like.
	for (const wall of layout.walls ?? []) if (!wall.kind) onCap(wall, wall.id);
	return spots;
}

/** The point looked at on each wall of a kind (rubble, webs): where it is broken or cut. */
export function wallSpots(layout: MapLayout, kind: 'rubble' | 'web'): PrySpot[] {
	return (layout.walls ?? [])
		.filter((wall) => wall.kind === kind)
		.map((wall) => {
			const edge = rotateEdge('n', wall.rotation) as Edge;
			const [ex, ez] = EDGE_DIR[edge];
			const [x, y, z] = wall.position;
			return {
				position: [
					x - ex * FALSE_WALLS.depth,
					y + FALSE_WALLS.height,
					z - ez * FALSE_WALLS.depth
				] as Vec3,
				wall: wall.id
			};
		});
}

/**
 * The dead-end wall a player is looking at within reach (`FALSE_WALLS.reach`, `angle`), or null.
 * The point is on the rock face, so the line to it may end in the wall it is on.
 */
export function lookedAtPrySpot<T extends PrySpot>(
	world: CollisionWorld,
	eye: Vec3,
	look: Vec3,
	spots: Iterable<T>
): T | null {
	let best: T | null = null;
	let bestScore = Infinity;
	for (const spot of spots) {
		const to: Vec3 = [
			spot.position[0] - eye[0],
			spot.position[1] - eye[1],
			spot.position[2] - eye[2]
		];
		const d = Math.hypot(to[0], to[1], to[2]);
		if (d > FALSE_WALLS.reach + 0.6) continue;
		const along = (to[0] * look[0] + to[1] * look[1] + to[2] * look[2]) / Math.max(d, 1e-6);
		const angle = Math.acos(Math.min(1, Math.max(-1, along)));
		if (angle > FALSE_WALLS.angle) continue;
		const t = segmentHit(world, eye, spot.position);
		if (t !== null && (1 - t) * d > 0.8) continue;
		const score = angle + d * 0.1;
		if (score < bestScore) {
			best = spot;
			bestScore = score;
		}
	}
	return best;
}
