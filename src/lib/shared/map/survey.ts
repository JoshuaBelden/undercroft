import { ITEMS } from '../../content/items.ts';
import { allStacks } from '../items/inventory.ts';
import type { Inventory } from '../player/types.ts';
import { segmentBlocked, type CollisionWorld } from './collision.ts';
import {
	CELL,
	EDGE_DIR,
	LEVEL_HEIGHT,
	cellKey,
	occupiedCells,
	placementLevel,
	worldSocket
} from './grid.ts';
import type { Edge, MapKit, MapLayout, PieceDef, SketchSymbol, Vec3 } from './types.ts';

/**
 * The explorer's map (docs/dev/map.md): the catacombs as cells a map can show, worked out from
 * the layout the same way on the server and the client. The server keeps which cells each
 * player has sketched; the client draws those from this.
 */

/** What lies across one side of a cell: more of the same piece, a way through, or stone. */
export type SideKind = 'open' | 'way' | 'wall';

export interface SurveyCell {
	/** World cell [x, z] and level (0 the start level, down is negative). */
	cell: [number, number, number];
	/** The placement (index into `layout.placements`) the cell belongs to. */
	piece: number;
	/** In a room (drawn filling the cell), not a passage (drawn down the middle of it). */
	room: boolean;
	sides: Record<Edge, SideKind>;
	/** Cells you can walk to from this one: next to it through a side, or up and down a stair. */
	next: string[];
}

/** A symbol drawn on the map where a piece is. */
export interface SurveyFeature {
	kind: 'down' | 'up' | 'extraction' | SketchSymbol;
	/** The placement it belongs to: it shows once one of its cells on `level` is mapped. */
	piece: number;
	level: number;
	/** World position (m) of the symbol, [x, z]. */
	at: [number, number];
}

/** A named room: its name shows once one of its cells is mapped. */
export interface SurveyRoom {
	title: string;
	piece: number;
	level: number;
	at: [number, number];
}

export interface SurveyMap {
	/** Every cell a map can show, by `cellKey`. */
	cells: Map<string, SurveyCell>;
	/** The levels, top (0) first. */
	levels: number[];
	features: SurveyFeature[];
	rooms: SurveyRoom[];
}

const EDGES: Edge[] = ['n', 'e', 's', 'w'];

/**
 * The map of a layout. Caps fill no cell and aren't counted, so they leave a wall where they seal.
 * A dead end is walked into (its bricks lie there), so its opening is a way through.
 */
export function surveyMap(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit
): SurveyMap {
	const owner = new Map<string, number>();
	const cells = new Map<string, SurveyCell>();
	const features: SurveyFeature[] = [];
	const rooms: SurveyRoom[] = [];
	/** Openings on each side, from the pieces on either side of it: two make a way through. */
	const openings = new Map<string, number>();
	layout.placements.forEach((placement, index) => {
		const piece = pieces[placement.piece];
		const entry = kit[placement.piece];
		if (!piece || entry?.role === 'cap') return;
		const role = entry?.role;
		const room =
			role === 'start' || role === 'major' || role === 'extraction' || entry?.room === true;
		for (const cell of occupiedCells(piece, placement)) {
			const key = cellKey(...cell);
			owner.set(key, index);
			cells.set(key, {
				cell,
				piece: index,
				room,
				sides: { n: 'wall', e: 'wall', s: 'wall', w: 'wall' },
				next: []
			});
		}
		for (const socket of piece.sockets) {
			const { cell, level, edge } = worldSocket(piece, placement, socket);
			const [dx, dz] = EDGE_DIR[edge];
			const side = sideKey(cell[0], cell[1], level, cell[0] + dx, cell[1] + dz);
			openings.set(side, (openings.get(side) ?? 0) + 1);
		}
		const base = placementLevel(placement);
		const top = base + piece.levels - 1;
		const at: [number, number] = [placement.position[0], placement.position[2]];
		if (entry?.descends && top > base) {
			features.push({ kind: 'down', piece: index, level: top, at });
			features.push({ kind: 'up', piece: index, level: base, at });
		}
		if (entry?.role === 'extraction')
			features.push({ kind: 'extraction', piece: index, level: base, at });
		if (entry?.sketch) features.push({ kind: entry.sketch, piece: index, level: base, at });
		if (entry?.title) rooms.push({ title: entry.title, piece: index, level: base, at });
	});
	for (const info of cells.values()) {
		const [x, z, level] = info.cell;
		for (const edge of EDGES) {
			const [dx, dz] = EDGE_DIR[edge];
			const across = cellKey(x + dx, z + dz, level);
			if (owner.get(across) === info.piece) info.sides[edge] = 'open';
			else if (
				cells.has(across) &&
				(openings.get(sideKey(x, z, level, x + dx, z + dz)) ?? 0) >= 2
			) {
				info.sides[edge] = 'way';
			}
			if (info.sides[edge] !== 'wall') info.next.push(across);
		}
		// Up and down within one piece: a stair.
		for (const dy of [1, -1]) {
			const other = cellKey(x, z, level + dy);
			if (owner.get(other) === info.piece) info.next.push(other);
		}
	}
	const levels = [...new Set([...cells.values()].map((c) => c.cell[2]))].sort((a, b) => b - a);
	return { cells, levels, features, rooms };
}

/** The same key from either cell beside a side. */
function sideKey(x1: number, z1: number, level: number, x2: number, z2: number): string {
	const first = x1 < x2 || (x1 === x2 && z1 < z2);
	return first ? `${x1},${z1},${x2},${z2},${level}` : `${x2},${z2},${x1},${z1},${level}`;
}

/** The cell someone standing at `feet` is in, if it is one the map knows. */
export function cellAt(map: SurveyMap, feet: Vec3): string | null {
	const [x, z] = [Math.round(feet[0] / CELL), Math.round(feet[2] / CELL)];
	const y = feet[1] / LEVEL_HEIGHT;
	// Halfway down a stair the feet are between levels: either will do.
	for (const level of [Math.round(y), Math.floor(y), Math.ceil(y)]) {
		const key = cellKey(x, z, level);
		if (map.cells.has(key)) return key;
	}
	return null;
}

/**
 * What a sketch made from here puts on the map: only what you can see. The cell you stand in,
 * and every cell whose middle is in clear sight from your eye and no more than `range` metres
 * away, found by walking out through the ways. Nothing is reached through a cell you can't see,
 * so a corner or a pillar stops the pencil, even in your own room.
 */
export function sketchCells(
	map: SurveyMap,
	world: CollisionWorld,
	feet: Vec3,
	eye: Vec3,
	range: number
): string[] {
	const start = cellAt(map, feet);
	if (!start) return [];
	const found = new Set([start]);
	let frontier = [start];
	while (frontier.length) {
		const next: string[] = [];
		for (const key of frontier) {
			for (const other of map.cells.get(key)!.next) {
				if (found.has(other)) continue;
				const [x, z, level] = map.cells.get(other)!.cell;
				// The middle of the cell, at about the height of an eye.
				const target: Vec3 = [x * CELL, level * LEVEL_HEIGHT + 1.4, z * CELL];
				const far = Math.hypot(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
				if (far > range || segmentBlocked(world, eye, target)) continue;
				found.add(other);
				next.push(other);
			}
		}
		frontier = next;
	}
	return [...found];
}

/** Carrying something to map with (a surveyor's notebook), anywhere in the pack. */
export function carriesSurvey(inventory: Inventory): boolean {
	return allStacks(inventory).some((stack) => ITEMS[stack.item]?.survey === true);
}
