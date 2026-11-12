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

/** Floor-level centre of each start and major room, for admin teleports. */
export function roomPoints(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit
): { name: string; position: Vec3 }[] {
	return layout.placements
		.filter((p) => kit[p.piece]?.role === 'major' || kit[p.piece]?.role === 'start')
		.map((p) => {
			const floor = pieces[p.piece]?.sockets[0]?.level ?? 0;
			return {
				name: p.piece,
				position: [p.position[0], p.position[1] + floor * LEVEL_HEIGHT + 0.05, p.position[2]]
			};
		});
}

/** Where creatures may start: every creature-* marker in the map, in world space. */
export function creatureSpawns(layout: MapLayout, pieces: Record<string, PieceDef>): Vec3[] {
	return layout.placements.flatMap((placement) =>
		(pieces[placement.piece]?.creatures ?? []).map((local) => toWorld(placement, local))
	);
}
