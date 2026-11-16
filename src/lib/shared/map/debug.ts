import { CELL, EDGE_DIR, occupiedCells, placementLevel, worldSocket } from './grid.ts';
import type { Edge, KitEntry, MapKit, MapLayout, PieceDef } from './types.ts';

/**
 * What the map debug grid shows (dev only, see docs/dev/map-generation.md#debug-grid): every cell
 * the pieces occupy, and every entrance (socket) on a cell edge, connected or blocked. Edges
 * with no entrance are not listed.
 */
export interface MapDebugGrid {
	/** Occupied world cells, [x, z, level], one entry per cell. */
	cells: [number, number, number][];
	/** The cells rooms occupy (start, major, extraction and minor rooms), highlighted. */
	roomCells: [number, number, number][];
	entrances: DebugEntrance[];
	counts: MapDebugCounts;
}

/** What the map is made of, for the debug view's side panel. */
export interface MapDebugCounts {
	rooms: { total: number; start: number; major: number; extraction: number; minor: number };
	/** Passages: every connector that isn't a minor room. */
	tunnels: number;
	deadEnds: number;
	caps: number;
	entrances: { connected: number; blocked: number };
	cells: number;
	/** Levels from the top of the map to the bottom. */
	levels: number;
	/** How many of each room and tunnel piece, most first. */
	pieces: { piece: string; count: number; room: boolean }[];
}

/** A placed piece's place in the counts. */
function kindOf(
	entry: KitEntry | undefined
): 'start' | 'major' | 'extraction' | 'minor' | 'tunnel' | 'end' | 'cap' {
	if (!entry) return 'tunnel';
	if (entry.role === 'connector') return entry.room ? 'minor' : 'tunnel';
	return entry.role;
}

/**
 * connected: a way through to another piece. blocked: sealed by a cap, closed by a dead end, or
 * left open with nothing across it (a generator bug).
 */
export type EntranceState = 'connected' | 'blocked';

export interface DebugEntrance {
	/** One of the two cells the edge lies between, and the edge on that cell. */
	cell: [number, number];
	level: number;
	edge: Edge;
	type: string;
	state: EntranceState;
}

interface EdgeEntry {
	entrance: Omit<DebugEntrance, 'state'>;
	sockets: number;
	capped: boolean;
	deadEnd: boolean;
}

/** The edge's midpoint in half-cell units, with its level: the same from both sides of it. */
function edgeKey(cell: [number, number], level: number, edge: Edge): string {
	const [dx, dz] = EDGE_DIR[edge];
	return `${cell[0] * 2 + dx},${cell[1] * 2 + dz},${level}`;
}

export function mapDebugGrid(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit
): MapDebugGrid {
	const cells = new Map<string, [number, number, number]>();
	const edges = new Map<string, EdgeEntry>();
	const roomCells = new Map<string, [number, number, number]>();
	const caps: string[] = [];
	const kinds = { start: 0, major: 0, extraction: 0, minor: 0, tunnel: 0, end: 0, cap: 0 };
	const perPiece = new Map<string, { piece: string; count: number; room: boolean }>();
	for (const placement of layout.placements) {
		const piece = pieces[placement.piece];
		if (!piece) continue;
		const role = kit[placement.piece]?.role;
		const kind = kindOf(kit[placement.piece]);
		kinds[kind]++;
		const room = kind !== 'tunnel' && kind !== 'end' && kind !== 'cap';
		if (room || kind === 'tunnel') {
			const tally = perPiece.get(placement.piece) ?? { piece: placement.piece, count: 0, room };
			tally.count++;
			perPiece.set(placement.piece, tally);
		}
		if (room) {
			for (const cell of occupiedCells(piece, placement)) roomCells.set(cell.join(','), cell);
		}
		if (role === 'cap') {
			// Caps sit with their origin on the opening they seal (see generate.ts, Seal).
			const [x, , z] = placement.position;
			caps.push(
				`${Math.round((x * 2) / CELL)},${Math.round((z * 2) / CELL)},${placementLevel(placement)}`
			);
			continue;
		}
		for (const cell of occupiedCells(piece, placement)) cells.set(cell.join(','), cell);
		for (const socket of piece.sockets) {
			const world = worldSocket(piece, placement, socket);
			const key = edgeKey(world.cell, world.level, world.edge);
			const entry = edges.get(key) ?? {
				entrance: { cell: world.cell, level: world.level, edge: world.edge, type: world.type },
				sockets: 0,
				capped: false,
				deadEnd: false
			};
			entry.sockets++;
			if (role === 'end') entry.deadEnd = true;
			edges.set(key, entry);
		}
	}
	for (const key of caps) {
		const entry = edges.get(key);
		if (entry) entry.capped = true;
	}
	const entrances = [...edges.values()].map(({ entrance, sockets, capped, deadEnd }) => ({
		...entrance,
		state: (sockets >= 2 && !capped && !deadEnd ? 'connected' : 'blocked') as EntranceState
	}));
	const levels = [...cells.values()].map((cell) => cell[2]);
	const connected = entrances.filter((e) => e.state === 'connected').length;
	return {
		cells: [...cells.values()],
		roomCells: [...roomCells.values()],
		entrances,
		counts: {
			rooms: {
				total: kinds.start + kinds.major + kinds.extraction + kinds.minor,
				start: kinds.start,
				major: kinds.major,
				extraction: kinds.extraction,
				minor: kinds.minor
			},
			tunnels: kinds.tunnel,
			deadEnds: kinds.end,
			caps: kinds.cap,
			entrances: { connected, blocked: entrances.length - connected },
			cells: cells.size,
			levels: levels.length ? Math.max(...levels) - Math.min(...levels) + 1 : 0,
			pieces: [...perPiece.values()].sort(
				(a, b) => b.count - a.count || a.piece.localeCompare(b.piece)
			)
		}
	};
}
