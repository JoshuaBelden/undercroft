import { LEVEL_HEIGHT, rotateXZ, toWorld } from './grid.ts';
import type { MapKit, MapLayout, PieceDef, Vec3 } from './types.ts';

/** Where players appear: the start room's first spawn marker, facing the room's +X (its opening). */
export function spawnPoint(
	layout: MapLayout,
	pieces: Record<string, PieceDef>
): { position: Vec3; yaw: number } {
	const start = layout.placements[0];
	const piece = pieces[start.piece];
	const local = piece?.spawns[0] ?? [0, 0, 0];
	const position = toWorld(start, local);
	const [dx, dz] = rotateXZ([1, 0], start.rotation);
	return { position: [position[0], position[1] + 0.05, position[2]], yaw: Math.atan2(-dx, -dz) };
}

/**
 * Floor-level centre of each start, major and extraction room, for admin teleports. A piece used
 * more than once (extraction rooms) is numbered from the second on: `extraction-shaft-2`.
 */
export function roomPoints(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit
): { name: string; position: Vec3 }[] {
	const rooms = new Set(['start', 'major', 'extraction']);
	const seen = new Map<string, number>();
	return layout.placements
		.filter((p) => rooms.has(kit[p.piece]?.role ?? ''))
		.map((p) => {
			const floor = pieces[p.piece]?.sockets[0]?.level ?? 0;
			const n = (seen.get(p.piece) ?? 0) + 1;
			seen.set(p.piece, n);
			return {
				name: n > 1 ? `${p.piece}-${n}` : p.piece,
				position: [p.position[0], p.position[1] + floor * LEVEL_HEIGHT + 0.05, p.position[2]]
			};
		});
}

/** Collapsed walls: every rubble-* marker in the map, in world space (where bricks lie). */
export function rubbleSites(layout: MapLayout, pieces: Record<string, PieceDef>): Vec3[] {
	return layout.placements.flatMap((placement) =>
		(pieces[placement.piece]?.rubble ?? []).map((local) => toWorld(placement, local))
	);
}

/** Where creatures may start: every creature-* marker in the map, in world space. */
export function creatureSpawns(layout: MapLayout, pieces: Record<string, PieceDef>): Vec3[] {
	return layout.placements.flatMap((placement) =>
		(pieces[placement.piece]?.creatures ?? []).map((local) => toWorld(placement, local))
	);
}
