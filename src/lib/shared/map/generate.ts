import { Rng } from '../rng.ts';
import {
	CELL,
	EDGE_DIR,
	LEVEL_HEIGHT,
	OPPOSITE,
	cellKey,
	cellOffset,
	occupiedCells,
	rotateEdge,
	rotateXZ,
	worldSocket,
	type WorldSocket
} from './grid.ts';
import type { Edge, MapKit, MapLayout, PieceDef, PieceRole, Placement } from './types.ts';

/**
 * Map layout generator. Runs on the server; clients receive the resulting layout.
 *
 * 1. Main route: start room -> its exit piece -> each major room in random order, joined by
 *    corridors of connectors, with extraction rooms spaced evenly along it. The `final` major
 *    room comes last, after a forced descent, and descending pieces only ever go down, so it is
 *    always the deepest room.
 * 2. Branches: side passages off open sockets, in passes, so branches can branch again.
 * 3. Loops: open sockets on the same level are joined by pathfinding a hall through free cells.
 * 4. Seal: facing open sockets are joined; the rest get a dead end or a cap.
 *
 * See docs/dev/map-generation.md.
 */

export interface GenerateOptions {
	/** Connectors between consecutive rooms on the main route. */
	corridor: [number, number];
	/** Connectors a corridor may grow beyond its length when the room at its end won't fit. */
	stretch: number;
	/** Extraction rooms on the main route, spaced evenly between the start and the final room. */
	extractions: number;
	/** Chance an open socket grows a side branch. */
	branchChance: number;
	branchLength: [number, number];
	/** Branching passes. Each pass can branch off the sockets the one before opened. */
	branchPasses: number;
	/** Loops to try to close. */
	loops: number;
	/** Longest loop path, in cells. */
	loopMaxCells: number;
	/** Chance a sealed socket gets a dead end instead of a flat cap (when there is room). */
	deadEndChance: number;
	/** Fresh RNG streams to try before giving up. */
	attempts: number;
	/** The Affliction the map is for: pieces owned by any other Affliction are left out. */
	affliction: string | null;
}

const DEFAULTS: GenerateOptions = {
	corridor: [4, 7],
	stretch: 3,
	extractions: 2,
	branchChance: 0.5,
	branchLength: [2, 5],
	branchPasses: 2,
	loops: 8,
	loopMaxCells: 16,
	deadEndChance: 0.55,
	attempts: 64,
	affliction: null
};

interface OpenSocket extends WorldSocket {
	connected: boolean;
}

class GenerationFailed extends Error {}

class LayoutState {
	placements: Placement[] = [];
	occupied = new Set<string>();
	sockets: OpenSocket[] = [];

	constructor(
		readonly rng: Rng,
		readonly pieces: Record<string, PieceDef>,
		readonly kit: MapKit
	) {}

	role(role: PieceRole): PieceDef[] {
		return Object.entries(this.kit)
			.filter(([name, entry]) => entry.role === role && this.pieces[name])
			.map(([name]) => this.pieces[name]);
	}

	free(x: number, z: number, level: number): boolean {
		return !this.occupied.has(cellKey(x, z, level));
	}

	fits(piece: PieceDef, placement: Placement): boolean {
		return occupiedCells(piece, placement).every(([x, z, l]) => this.free(x, z, l));
	}

	place(piece: PieceDef, placement: Placement): OpenSocket[] {
		this.placements.push(placement);
		for (const [x, z, l] of occupiedCells(piece, placement)) this.occupied.add(cellKey(x, z, l));
		const added = piece.sockets.map((s) => ({
			...worldSocket(piece, placement, s),
			connected: false
		}));
		this.sockets.push(...added);
		return added;
	}

	open(): OpenSocket[] {
		return this.sockets.filter((s) => !s.connected);
	}

	/**
	 * Connect `piece` to an open socket. Tries each matching socket of the piece in each rotation
	 * that makes it face `target`. Descending pieces only attach by their highest socket, so they
	 * always lead down. Returns the piece's remaining open sockets, or null if nothing fits.
	 */
	attach(target: OpenSocket, piece: PieceDef): OpenSocket[] | null {
		const want = OPPOSITE[target.edge];
		const [dx, dz] = EDGE_DIR[target.edge];
		const neighbour: [number, number] = [target.cell[0] + dx, target.cell[1] + dz];
		let candidates = piece.sockets.filter((s) => s.type === target.type);
		if (this.kit[piece.name]?.descends) {
			const top = Math.max(...candidates.map((s) => s.level));
			candidates = candidates.filter((s) => s.level === top);
		}
		for (const socket of this.rng.shuffle(candidates)) {
			for (const rotation of this.rng.shuffle([0, 1, 2, 3])) {
				if (rotateEdge(socket.edge, rotation) !== want) continue;
				const [ox, oz] = rotateXZ(cellOffset(piece, socket.cell), rotation);
				const placement: Placement = {
					piece: piece.name,
					position: [
						neighbour[0] * CELL - ox,
						(target.level - socket.level) * LEVEL_HEIGHT,
						neighbour[1] * CELL - oz
					],
					rotation
				};
				if (!this.fits(piece, placement)) continue;
				const added = this.place(piece, placement);
				target.connected = true;
				const mate = added.find((s) => facing(s, target));
				if (mate) mate.connected = true;
				return added.filter((s) => !s.connected);
			}
		}
		return null;
	}

	/** Try connectors in weighted order until one attaches. */
	attachAny(target: OpenSocket, options: PieceDef[]): OpenSocket[] | null {
		for (const piece of this.weightedOrder(options)) {
			const next = this.attach(target, piece);
			if (next) return next;
		}
		return null;
	}

	weightedOrder(items: PieceDef[]): PieceDef[] {
		const left = [...items];
		const out: PieceDef[] = [];
		while (left.length) {
			const pick = this.rng.weighted(left, (p) => this.kit[p.name].weight ?? 1);
			out.push(pick);
			left.splice(left.indexOf(pick), 1);
		}
		return out;
	}

	/** Place a 1x1 hall piece in `cell` whose sockets face exactly `edges`. */
	placeHall(cell: [number, number], level: number, edges: Edge[], halls: PieceDef[]): boolean {
		for (const piece of halls) {
			if (piece.footprint[0] !== 1 || piece.footprint[1] !== 1) continue;
			if (piece.sockets.length !== edges.length) continue;
			for (let rotation = 0; rotation < 4; rotation++) {
				const rotated = piece.sockets.map((s) => rotateEdge(s.edge, rotation));
				if (!edges.every((e) => rotated.includes(e))) continue;
				const placement: Placement = {
					piece: piece.name,
					position: [cell[0] * CELL, level * LEVEL_HEIGHT, cell[1] * CELL],
					rotation
				};
				if (!this.fits(piece, placement)) continue;
				for (const s of this.place(piece, placement)) s.connected = true;
				return true;
			}
		}
		return false;
	}
}

/** True when `a` is the socket directly across the opening from `b`. */
function facing(a: WorldSocket, b: WorldSocket): boolean {
	const [dx, dz] = EDGE_DIR[b.edge];
	return (
		a.cell[0] === b.cell[0] + dx &&
		a.cell[1] === b.cell[1] + dz &&
		a.edge === OPPOSITE[b.edge] &&
		a.level === b.level &&
		a.type === b.type
	);
}

function edgeBetween(from: [number, number], to: [number, number]): Edge {
	const dx = to[0] - from[0];
	const dz = to[1] - from[1];
	if (dx === 1) return 'e';
	if (dx === -1) return 'w';
	return dz === 1 ? 's' : 'n';
}

/** Breadth-first path through free cells on one level, from `start` to `goal` inclusive. */
function findPath(
	state: LayoutState,
	start: [number, number],
	goal: [number, number],
	level: number,
	maxCells: number
): [number, number][] | null {
	const key = (c: [number, number]) => `${c[0]},${c[1]}`;
	if (!state.free(start[0], start[1], level) || !state.free(goal[0], goal[1], level)) return null;
	const prev = new Map<string, [number, number] | null>([[key(start), null]]);
	let frontier: [number, number][] = [start];
	for (let depth = 1; depth <= maxCells && frontier.length; depth++) {
		const next: [number, number][] = [];
		for (const cell of frontier) {
			if (cell[0] === goal[0] && cell[1] === goal[1]) {
				const path: [number, number][] = [];
				let at: [number, number] | null = cell;
				while (at) {
					path.unshift(at);
					at = prev.get(key(at)) ?? null;
				}
				return path;
			}
			for (const edge of state.rng.shuffle(['n', 'e', 's', 'w'] as Edge[])) {
				const [dx, dz] = EDGE_DIR[edge];
				const n: [number, number] = [cell[0] + dx, cell[1] + dz];
				if (prev.has(key(n)) || !state.free(n[0], n[1], level)) continue;
				prev.set(key(n), cell);
				next.push(n);
			}
		}
		frontier = next;
	}
	return null;
}

function tryGenerate(
	rng: Rng,
	pieces: Record<string, PieceDef>,
	kit: MapKit,
	options: GenerateOptions
): Placement[] {
	const state = new LayoutState(rng, pieces, kit);
	const connectors = state.role('connector');
	const flat = connectors.filter((p) => !kit[p.name].descends);
	const descenders = connectors.filter((p) => kit[p.name].descends);
	const ends = state.role('end');
	const caps = state.role('cap');
	const majors = state.role('major');
	const finals = majors.filter((p) => kit[p.name].final);
	const extractions = state.role('extraction');
	const rooms = rng.shuffle(majors.filter((p) => !kit[p.name].final));
	// Extraction rooms spaced evenly between the start and the final room: with three major rooms
	// and two extraction rooms, major, extraction, major, extraction, major, final.
	const want = extractions.length ? options.extractions : 0;
	const route: PieceDef[] = [];
	let placed = 0;
	for (let i = 0; i <= rooms.length; i++) {
		while (placed < want && Math.round(((placed + 1) * rooms.length) / (want + 1)) <= i) {
			route.push(rng.weighted(extractions, (p) => kit[p.name].weight ?? 1));
			placed++;
		}
		if (i < rooms.length) route.push(rooms[i]);
	}
	route.push(...rng.shuffle(finals));

	// Start room, its first cell on world cell [0, 0], then its fixed exit piece.
	const start = rng.pick(state.role('start'));
	const rotation = rng.int(0, 3);
	const [ox, oz] = rotateXZ(cellOffset(start, [0, 0]), rotation);
	const open = state.place(start, { piece: start.name, position: [-ox, 0, -oz], rotation });
	let tips = open;
	const exit = kit[start.name].exit;
	if (exit) {
		const next = state.attach(rng.pick(open), pieces[exit]);
		if (!next?.length) throw new GenerationFailed();
		tips = next;
	}

	// Main route through every major and extraction room. Each step grows from one of the last
	// piece's open sockets, trying the others when it doesn't fit; the ones not taken stay open
	// for branches. A room that won't fit stretches its corridor a little first.
	const grow = (kinds: PieceDef[]): OpenSocket[] | null => {
		for (const tip of rng.shuffle(tips)) {
			if (tip.connected) continue;
			const next = state.attachAny(tip, kinds);
			if (next?.length) return next;
		}
		return null;
	};
	for (const room of route) {
		const length = rng.int(options.corridor[0], options.corridor[1]);
		const descendAt = kit[room.name].final && descenders.length ? rng.int(0, length - 1) : -1;
		for (let i = 0; i < length; i++) {
			const next = grow(i === descendAt ? descenders : flat);
			if (!next) throw new GenerationFailed();
			tips = next;
		}
		const final = room === route[route.length - 1];
		let next: OpenSocket[] | null = null;
		for (let stretch = 0; stretch <= options.stretch && !next; stretch++) {
			if (stretch > 0) {
				const longer = grow(flat);
				if (!longer) break;
				tips = longer;
			}
			for (const tip of rng.shuffle(tips)) {
				if (tip.connected) continue;
				next = state.attach(tip, room);
				if (next) break;
			}
		}
		// Only the final room may close the route.
		if (!next || (!final && !next.length)) throw new GenerationFailed();
		if (final) break;
		tips = next;
	}

	// Side branches (never descending, so nothing ends up below the final room). A tee or cross on
	// a branch leaves sockets open that the next pass can branch off again.
	for (let pass = 0; pass < options.branchPasses; pass++) {
		for (const socket of rng.shuffle(state.open())) {
			if (socket.connected || rng.next() > options.branchChance) continue;
			let tip: OpenSocket = socket;
			const length = rng.int(options.branchLength[0], options.branchLength[1]);
			for (let i = 0; i < length; i++) {
				const next = state.attachAny(tip, flat);
				if (!next?.length) break;
				tip = rng.pick(next);
			}
		}
	}

	// Loops: join pairs of open sockets on the same level with a pathfound hall.
	const halls = flat.filter((p) => p.footprint[0] === 1 && p.footprint[1] === 1);
	let loops = 0;
	for (const a of rng.shuffle(state.open())) {
		if (loops >= options.loops) break;
		if (a.connected) continue;
		const [adx, adz] = EDGE_DIR[a.edge];
		const from: [number, number] = [a.cell[0] + adx, a.cell[1] + adz];
		const candidates = state
			.open()
			.filter((b) => b !== a && b.level === a.level && b.type === a.type)
			.sort(
				(p, q) =>
					Math.abs(p.cell[0] - a.cell[0]) +
					Math.abs(p.cell[1] - a.cell[1]) -
					(Math.abs(q.cell[0] - a.cell[0]) + Math.abs(q.cell[1] - a.cell[1]))
			);
		for (const b of candidates) {
			const [bdx, bdz] = EDGE_DIR[b.edge];
			const to: [number, number] = [b.cell[0] + bdx, b.cell[1] + bdz];
			const path = findPath(state, from, to, a.level, options.loopMaxCells);
			if (!path || path.length < 2) continue;
			const ok = path.every((cell, i) => {
				const back = i === 0 ? OPPOSITE[a.edge] : edgeBetween(cell, path[i - 1]);
				const fwd = i === path.length - 1 ? OPPOSITE[b.edge] : edgeBetween(cell, path[i + 1]);
				return state.placeHall(cell, a.level, [back, fwd], halls);
			});
			if (!ok) throw new GenerationFailed();
			a.connected = b.connected = true;
			loops++;
			break;
		}
	}

	// Seal: join facing sockets, then dead ends or caps.
	for (const socket of state.open()) {
		if (socket.connected) continue;
		const across = state.open().find((other) => other !== socket && facing(other, socket));
		if (across) {
			socket.connected = across.connected = true;
			continue;
		}
		if (ends.length && rng.next() < options.deadEndChance && state.attachAny(socket, ends))
			continue;
		const cap = caps.find((c) => kit[c.name].seals === socket.type);
		if (!cap) throw new Error(`No cap piece seals "${socket.type}" openings`);
		const [ex, ez] = EDGE_DIR[socket.edge];
		// Caps are modelled facing north with their origin on the opening.
		const capRotation = [0, 1, 2, 3].find((r) => rotateEdge('n', r) === socket.edge) ?? 0;
		state.placements.push({
			piece: cap.name,
			position: [
				(socket.cell[0] + ex / 2) * CELL,
				socket.level * LEVEL_HEIGHT,
				(socket.cell[1] + ez / 2) * CELL
			],
			rotation: capRotation
		});
		socket.connected = true;
	}
	return state.placements;
}

export function generateLayout(
	seed: number,
	pieces: Record<string, PieceDef>,
	kit: MapKit,
	options: Partial<GenerateOptions> = {}
): MapLayout {
	const opts = { ...DEFAULTS, ...options };
	const own = Object.fromEntries(
		Object.entries(kit).filter(
			([, entry]) => !entry.affliction || entry.affliction === opts.affliction
		)
	);
	for (let attempt = 0; attempt < opts.attempts; attempt++) {
		const rng = new Rng((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
		try {
			return {
				seed,
				affliction: opts.affliction,
				placements: tryGenerate(rng, pieces, own, opts),
				crates: []
			};
		} catch (error) {
			if (!(error instanceof GenerationFailed)) throw error;
		}
	}
	throw new Error(`Map generation failed for seed ${seed}`);
}
