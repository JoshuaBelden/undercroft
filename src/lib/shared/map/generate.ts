import { Rng } from '../rng.ts';
import { placeDoors } from './doors.ts';
import { placeWalls } from './walls.ts';
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
 * The map is `tiers` levels stacked one under the other. Each one is grown the same way:
 *
 * 1. Main route: from where the level begins (the start room on the first, the foot of the long
 *    stair on the others), through the level's share of the major rooms, joined by corridors of
 *    connectors, to its last room: an extraction room, or on the deepest level the `final` room.
 *    An extraction room's `gate` takes the `descent` piece (the long stair behind a double door),
 *    whose foot is where the next level begins. That stair is the only way between levels.
 * 2. Branches: side passages off open sockets, in passes, so branches can branch again.
 * 3. Loops: open sockets on the same level are joined by pathfinding a hall through free cells.
 * 4. Seal: facing open sockets are joined; the rest get a dead end or a cap.
 *
 * Loops and joins never connect two levels, and never two sockets with the same anchor (the room
 * or junction a plain passage leads back to): no corridor leaves a room and comes straight back
 * into it.
 *
 * See docs/dev/map-generation.md.
 */

export interface GenerateOptions {
	/** Connectors between consecutive rooms on the main route. */
	corridor: [number, number];
	/** Connectors a corridor may grow beyond its length when the room at its end won't fit. */
	stretch: number;
	/**
	 * Levels. Every one but the deepest ends in an extraction room whose double door leads down
	 * the long stair to the next. Needs an `extraction` and a `descent` piece; otherwise one level.
	 */
	tiers: number;
	/** Chance an open socket grows a side branch. */
	branchChance: number;
	branchLength: [number, number];
	/** Branching passes. Each pass can branch off the sockets the one before opened. */
	branchPasses: number;
	/** Loops to try to close. */
	loops: number;
	/** Longest loop path, in cells. */
	loopMaxCells: number;
	/** Rope drops (`needsRope` connectors) to hang off the map, each with a branch at its foot. */
	ropeDrops: number;
	/** Connectors on from the foot of a rope drop. */
	dropBranch: [number, number];
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
	tiers: 3,
	branchChance: 0.55,
	branchLength: [2, 5],
	branchPasses: 2,
	loops: 8,
	loopMaxCells: 16,
	ropeDrops: 1,
	dropBranch: [1, 3],
	deadEndChance: 0.55,
	attempts: 64,
	affliction: null
};

interface OpenSocket extends WorldSocket {
	connected: boolean;
	/** Index of the placement the socket belongs to. */
	owner: number;
	/** Level of the map (0 = top) the socket's piece is on. */
	tier: number;
}

class GenerationFailed extends Error {}

class LayoutState {
	placements: Placement[] = [];
	occupied = new Set<string>();
	sockets: OpenSocket[] = [];
	/** Which placements open into which (caps and seals excluded). */
	links: Set<number>[] = [];

	constructor(
		/** Not readonly: the rope drops swap in their own stream while they are placed. */
		public rng: Rng,
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
		const owner = this.placements.length;
		this.placements.push(placement);
		this.links.push(new Set());
		for (const [x, z, l] of occupiedCells(piece, placement)) this.occupied.add(cellKey(x, z, l));
		const added = piece.sockets.map((s) => ({
			...worldSocket(piece, placement, s),
			connected: false,
			owner,
			tier: placement.tier
		}));
		this.sockets.push(...added);
		return added;
	}

	link(a: number, b: number): void {
		this.links[a].add(b);
		this.links[b].add(a);
	}

	/** Join two open sockets (facing each other, or the two ends of a loop). */
	join(a: OpenSocket, b: OpenSocket): void {
		a.connected = b.connected = true;
		this.link(a.owner, b.owner);
	}

	open(): OpenSocket[] {
		return this.sockets.filter((s) => !s.connected);
	}

	/**
	 * The room or junction a placement's passage leads back to: walking back from it through plain
	 * passages (connectors with two openings that are not rooms) to the first piece that isn't one.
	 * Two open sockets with the same anchor must never be joined: that would be a corridor going
	 * round in a circle back into where it started, with no junction on the way.
	 */
	anchor(index: number): number {
		const seen = new Set<number>();
		let at = index;
		while (this.passage(at) && !seen.has(at)) {
			seen.add(at);
			const back = [...this.links[at]].find((n) => !seen.has(n));
			if (back === undefined) break;
			at = back;
		}
		return at;
	}

	private passage(index: number): boolean {
		const name = this.placements[index].piece;
		const entry = this.kit[name];
		return entry?.role === 'connector' && !entry.room && this.pieces[name]?.sockets.length === 2;
	}

	/** May these two open sockets be joined into one passage? */
	joinable(a: OpenSocket, b: OpenSocket): boolean {
		return (
			a.tier === b.tier &&
			a.level === b.level &&
			a.type === b.type &&
			this.anchor(a.owner) !== this.anchor(b.owner)
		);
	}

	/**
	 * Connect `piece` to an open socket. Tries each matching socket of the piece in each rotation
	 * that makes it face `target`. Descending pieces only attach by their highest socket, so they
	 * always lead down. The piece goes on `tier` (the target's own by default). Returns the piece's
	 * remaining open sockets, or null if nothing fits.
	 */
	attach(target: OpenSocket, piece: PieceDef, tier = target.tier): OpenSocket[] | null {
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
					rotation,
					tier
				};
				if (!this.fits(piece, placement)) continue;
				const added = this.place(piece, placement);
				const mate = added.find((s) => facing(s, target));
				target.connected = true;
				this.link(target.owner, added[0].owner);
				if (mate) mate.connected = true;
				return added.filter((s) => !s.connected);
			}
		}
		return null;
	}

	/** Try connectors in weighted order until one attaches. */
	attachAny(target: OpenSocket, options: PieceDef[], tier = target.tier): OpenSocket[] | null {
		for (const piece of this.weightedOrder(options)) {
			const next = this.attach(target, piece, tier);
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

	/**
	 * Place a 1x1 hall piece in `cell` whose sockets face exactly `edges`. Returns its placement
	 * index, or -1 if nothing fits.
	 */
	placeHall(
		cell: [number, number],
		level: number,
		edges: Edge[],
		halls: PieceDef[],
		tier: number
	): number {
		for (const piece of halls) {
			if (piece.footprint[0] !== 1 || piece.footprint[1] !== 1) continue;
			if (piece.sockets.length !== edges.length) continue;
			for (let rotation = 0; rotation < 4; rotation++) {
				const rotated = piece.sockets.map((s) => rotateEdge(s.edge, rotation));
				if (!edges.every((e) => rotated.includes(e))) continue;
				const placement: Placement = {
					piece: piece.name,
					position: [cell[0] * CELL, level * LEVEL_HEIGHT, cell[1] * CELL],
					rotation,
					tier
				};
				if (!this.fits(piece, placement)) continue;
				const added = this.place(piece, placement);
				for (const s of added) s.connected = true;
				return added[0].owner;
			}
		}
		return -1;
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

/**
 * The rooms on each level's main route, in order: the major rooms shared out evenly (in random
 * order), then the level's last room: an extraction room, or on the deepest level the final room.
 */
function planRoute(
	rng: Rng,
	kit: MapKit,
	majors: PieceDef[],
	extractions: PieceDef[],
	tiers: number
): PieceDef[][] {
	const finals = majors.filter((p) => kit[p.name].final);
	const rooms = rng.shuffle(majors.filter((p) => !kit[p.name].final));
	const route: PieceDef[][] = Array.from({ length: tiers }, () => []);
	rooms.forEach((room, i) => route[Math.floor((i * tiers) / rooms.length)].push(room));
	for (let t = 0; t < tiers - 1; t++) {
		route[t].push(rng.weighted(extractions, (p) => kit[p.name].weight ?? 1));
	}
	route[tiers - 1].push(...rng.shuffle(finals));
	return route;
}

function tryGenerate(
	rng: Rng,
	pieces: Record<string, PieceDef>,
	kit: MapKit,
	options: GenerateOptions,
	/** Its own stream for the rope drops, so adding them leaves the rest of the map as it was. */
	dropRng: Rng
): Placement[] {
	const state = new LayoutState(rng, pieces, kit);
	const connectors = state.role('connector');
	const flat = connectors.filter((p) => !kit[p.name].descends);
	// What the main route is made of: no ledges (the nav grid can't climb them).
	const onRoute = flat.filter((p) => !kit[p.name].offRoute);
	const ropeDrops = connectors.filter((p) => kit[p.name].needsRope);
	const ends = state.role('end');
	const caps = state.role('cap');
	const extractions = state.role('extraction');
	const descents = state.role('descent');
	const tiers = extractions.length && descents.length ? Math.max(1, options.tiers) : 1;
	const route = planRoute(rng, kit, state.role('major'), extractions, tiers);

	// Start room, its first cell on world cell [0, 0], then its fixed exit piece.
	const start = rng.pick(state.role('start'));
	const rotation = rng.int(0, 3);
	const [ox, oz] = rotateXZ(cellOffset(start, [0, 0]), rotation);
	const open = state.place(start, {
		piece: start.name,
		position: [-ox, 0, -oz],
		rotation,
		tier: 0
	});
	let tips = open;
	const exit = kit[start.name].exit;
	if (exit) {
		const next = state.attach(rng.pick(open), pieces[exit]);
		if (!next?.length) throw new GenerationFailed();
		tips = next;
	}

	// Main route through each level. Each step grows from one of the last piece's open sockets,
	// trying the others when it doesn't fit; the ones not taken stay open for branches. A room that
	// won't fit stretches its corridor a little first.
	const grow = (kinds: PieceDef[]): OpenSocket[] | null => {
		for (const tip of rng.shuffle(tips)) {
			if (tip.connected) continue;
			const next = state.attachAny(tip, kinds);
			if (next?.length) return next;
		}
		return null;
	};
	const last = route[tiers - 1][route[tiers - 1].length - 1];
	for (let tier = 0; tier < tiers; tier++) {
		for (const room of route[tier]) {
			const length = rng.int(options.corridor[0], options.corridor[1]);
			for (let i = 0; i < length; i++) {
				const next = grow(onRoute);
				if (!next) throw new GenerationFailed();
				tips = next;
			}
			let next: OpenSocket[] | null = null;
			for (let stretch = 0; stretch <= options.stretch && !next; stretch++) {
				if (stretch > 0) {
					const longer = grow(onRoute);
					if (!longer) break;
					tips = longer;
				}
				for (const tip of rng.shuffle(tips)) {
					if (tip.connected) continue;
					next = state.attach(tip, room);
					if (next) break;
				}
			}
			// Only the very last room may close the route.
			if (!next || (room !== last && !next.length)) throw new GenerationFailed();
			if (room === last) break;
			tips = next.filter((s) => s.type !== 'gate');
			if (kit[room.name].role !== 'extraction' || tier === tiers - 1) continue;
			// The end of the level: the double door and the long stair down to the next one.
			const gate = next.find((s) => s.type === 'gate');
			const down = gate && state.attachAny(gate, descents, tier + 1);
			if (!down?.length) throw new GenerationFailed();
			tips = down;
		}
	}

	// Side branches (never descending, so every level stays on its own floor). A tee or cross on
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

	// Rope drops: off an opening the route and branches left, a drop and a short way on at its
	// foot. Only ever a detour, never the only way on (docs/dev/rope.md).
	const mainRng = state.rng;
	state.rng = dropRng;
	for (let i = 0; i < options.ropeDrops && ropeDrops.length; i++) {
		for (const socket of dropRng.shuffle(state.open())) {
			if (socket.connected) continue;
			const foot = state.attachAny(socket, ropeDrops);
			if (!foot) continue;
			let tip = foot.length ? dropRng.pick(foot) : null;
			const length = dropRng.int(options.dropBranch[0], options.dropBranch[1]);
			for (let k = 0; tip && k < length; k++) {
				const next = state.attachAny(tip, flat);
				tip = next?.length ? dropRng.pick(next) : null;
			}
			break;
		}
	}
	state.rng = mainRng;

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
			.filter((b) => b !== a && state.joinable(a, b))
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
			let previous = a.owner;
			for (let i = 0; i < path.length; i++) {
				const cell = path[i];
				const back = i === 0 ? OPPOSITE[a.edge] : edgeBetween(cell, path[i - 1]);
				const fwd = i === path.length - 1 ? OPPOSITE[b.edge] : edgeBetween(cell, path[i + 1]);
				const placed = state.placeHall(cell, a.level, [back, fwd], halls, a.tier);
				if (placed < 0) throw new GenerationFailed();
				state.link(previous, placed);
				previous = placed;
			}
			state.link(previous, b.owner);
			a.connected = b.connected = true;
			loops++;
			break;
		}
	}

	// Seal: join facing sockets (unless that would make a roundabout), then dead ends or caps.
	for (const socket of state.open()) {
		if (socket.connected) continue;
		const across = state
			.open()
			.find((other) => other !== socket && facing(other, socket) && state.joinable(socket, other));
		if (across) {
			state.join(socket, across);
			continue;
		}
		if (ends.length && rng.next() < options.deadEndChance && state.attachAny(socket, ends))
			continue;
		const cap = caps.find((c) => kit[c.name].seals === socket.type);
		if (!cap) throw new GenerationFailed();
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
			rotation: capRotation,
			tier: socket.tier
		});
		state.links.push(new Set());
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
		const dropRng = new Rng((seed ^ 0x0d70f00d) + attempt);
		try {
			const layout: MapLayout = {
				seed,
				affliction: opts.affliction,
				placements: tryGenerate(rng, pieces, own, opts, dropRng),
				crates: [],
				doors: []
			};
			layout.doors = placeDoors(layout, pieces);
			layout.walls = placeWalls(layout, pieces, own, seed);
			return layout;
		} catch (error) {
			if (!(error instanceof GenerationFailed)) throw error;
		}
	}
	throw new Error(`Map generation failed for seed ${seed}`);
}
