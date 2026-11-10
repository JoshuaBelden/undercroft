import type { Edge, PieceDef, PieceSocket, Placement, Vec3 } from './types.ts';

/** Grid cell size in metres (horizontal). */
export const CELL = 4;
/** Height of one grid level in metres. */
export const LEVEL_HEIGHT = 4;

export const EDGE_DIR: Record<Edge, [number, number]> = {
	n: [0, -1],
	e: [1, 0],
	s: [0, 1],
	w: [-1, 0]
};

export const OPPOSITE: Record<Edge, Edge> = { n: 's', e: 'w', s: 'n', w: 'e' };

/** Edges in the order a +90° turn around +Y maps them: e -> n -> w -> s -> e. */
const TURN_ORDER: Edge[] = ['e', 'n', 'w', 's'];

export function rotateEdge(edge: Edge, rotation: number): Edge {
	return TURN_ORDER[(TURN_ORDER.indexOf(edge) + rotation) % 4];
}

/** Rotate a horizontal vector [x, z] by quarter turns around +Y (matches Object3D.rotation.y). */
export function rotateXZ([x, z]: [number, number], rotation: number): [number, number] {
	switch (((rotation % 4) + 4) % 4) {
		case 1:
			return [z, -x];
		case 2:
			return [-x, -z];
		case 3:
			return [-z, x];
		default:
			return [x, z];
	}
}

/** Centre of a footprint cell relative to the piece origin, in metres (unrotated). */
export function cellOffset(piece: PieceDef, cell: [number, number]): [number, number] {
	const [w, d] = piece.footprint;
	return [(cell[0] - (w - 1) / 2) * CELL, (cell[1] - (d - 1) / 2) * CELL];
}

/** World grid cell containing a world position. Cell [i, j] is centred on (i * CELL, j * CELL). */
export function worldCell(x: number, z: number): [number, number] {
	return [Math.round(x / CELL), Math.round(z / CELL)];
}

export function placementLevel(placement: Placement): number {
	return Math.round(placement.position[1] / LEVEL_HEIGHT);
}

/** Every world cell (with level) a placed piece occupies. */
export function occupiedCells(piece: PieceDef, placement: Placement): [number, number, number][] {
	const out: [number, number, number][] = [];
	const [w, d] = piece.footprint;
	const base = placementLevel(placement);
	for (let x = 0; x < w; x++) {
		for (let z = 0; z < d; z++) {
			const [ox, oz] = rotateXZ(cellOffset(piece, [x, z]), placement.rotation);
			const [cx, cz] = worldCell(placement.position[0] + ox, placement.position[2] + oz);
			for (let level = 0; level < piece.levels; level++) out.push([cx, cz, base + level]);
		}
	}
	return out;
}

/** A socket resolved into world grid terms. */
export interface WorldSocket {
	type: string;
	cell: [number, number];
	level: number;
	edge: Edge;
}

export function worldSocket(
	piece: PieceDef,
	placement: Placement,
	socket: PieceSocket
): WorldSocket {
	const [ox, oz] = rotateXZ(cellOffset(piece, socket.cell), placement.rotation);
	return {
		type: socket.type,
		cell: worldCell(placement.position[0] + ox, placement.position[2] + oz),
		level: placementLevel(placement) + socket.level,
		edge: rotateEdge(socket.edge, placement.rotation)
	};
}

/** Transform a point from piece space into world space for a placement. */
export function toWorld(placement: Placement, [x, y, z]: Vec3): Vec3 {
	const [rx, rz] = rotateXZ([x, z], placement.rotation);
	const [px, py, pz] = placement.position;
	return [px + rx, py + y, pz + rz];
}

export function cellKey(x: number, z: number, level: number): string {
	return `${x},${z},${level}`;
}
