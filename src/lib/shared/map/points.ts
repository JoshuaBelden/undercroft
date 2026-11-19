import {
	capsuleFits,
	findFreeSpot,
	floorHeightAt,
	type CollisionWorld,
	type RopeLine
} from './collision.ts';
import { LEVEL_HEIGHT, rotateXZ, toWorld } from './grid.ts';
import type { MapKit, MapLayout, PieceDef, Vec3 } from './types.ts';

/**
 * Where a player appears: the start room's spawn marker `index` (the order players join, so a
 * party starts side by side; past the last marker it wraps round), facing the middle of the room
 * (the pit and its rope), or the room's +X from a spawn right in the middle.
 */
export function spawnPoint(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	index = 0
): { position: Vec3; yaw: number } {
	const start = layout.placements[0];
	const spawns = pieces[start.piece]?.spawns ?? [];
	const local: Vec3 = spawns.length ? spawns[index % spawns.length] : [0, 0, 0];
	const position = toWorld(start, local);
	let [dx, dz] = [start.position[0] - position[0], start.position[2] - position[2]];
	if (Math.hypot(dx, dz) < 0.1) [dx, dz] = rotateXZ([1, 0], start.rotation);
	return { position: [position[0], position[1] + 0.05, position[2]], yaw: Math.atan2(-dx, -dz) };
}

/**
 * Where the catacombs begin: the floor under the start room's rope, where players land climbing
 * down it. The nav grid grows from here, and the map is laid out (creatures, loot, the rite) by
 * how far things are from it. Without such a rope it is the first spawn.
 */
export function entryPoint(
	world: CollisionWorld,
	layout: MapLayout,
	pieces: Record<string, PieceDef>
): Vec3 {
	const spawn = spawnPoint(layout, pieces).position;
	let best: RopeLine | null = null;
	let bestDistance: number = ENTRY_REACH;
	for (const rope of world.ropes) {
		if (!rope.hangsFree) continue;
		const distance = Math.hypot(rope.top[0] - spawn[0], rope.top[2] - spawn[2]);
		if (distance < bestDistance) {
			best = rope;
			bestDistance = distance;
		}
	}
	if (!best) return spawn;
	const [x, , z] = best.top;
	const floor = floorHeightAt(world, x, z, best.bottom, best.bottom - 20);
	return floor === null ? spawn : [x, floor + 0.05, z];
}

/** The start room's rope hangs within this of its first spawn (m, across). */
const ENTRY_REACH = 8;

/**
 * Floor-level centre of each major and extraction room, for admin teleports. A piece used more
 * than once (extraction rooms) is numbered from the second on: `extraction-gate-2`. The start
 * room is its first spawn, and a start room over a pit also has `<name>-foot`, the floor under
 * the pit (its origin), to skip the climb down. Then the room side of each door between levels.
 */
export function roomPoints(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	kit: MapKit
): { name: string; position: Vec3 }[] {
	const rooms = new Set(['start', 'major', 'extraction']);
	const seen = new Map<string, number>();
	const points: { name: string; position: Vec3 }[] = layout.placements
		.filter((p) => rooms.has(kit[p.piece]?.role ?? ''))
		.flatMap((p) => {
			const floor = pieces[p.piece]?.sockets[0]?.level ?? 0;
			const n = (seen.get(p.piece) ?? 0) + 1;
			seen.set(p.piece, n);
			const name = n > 1 ? `${p.piece}-${n}` : p.piece;
			if (kit[p.piece]?.role !== 'start') {
				const centre: Vec3 = [
					p.position[0],
					p.position[1] + floor * LEVEL_HEIGHT + 0.05,
					p.position[2]
				];
				return [{ name, position: centre }];
			}
			// The start room's middle can be a pit: go where players start, or down to its foot.
			const start = [{ name, position: spawnPoint(layout, pieces).position }];
			if ((pieces[p.piece]?.levels ?? 1) < 2) return start;
			const foot: Vec3 = [p.position[0], p.position[1] + 0.05, p.position[2]];
			return [...start, { name: `${name}-foot`, position: foot }];
		});
	// The doors between levels: in front of each, on the room side (`level-2-door` leads to level 2).
	for (const door of layout.doors) {
		const [x, y, z] = door.position;
		points.push({
			name: `level-${door.tier + 1}-door`,
			position: [x - Math.sin(door.yaw) * 1.5, y + 0.05, z - Math.cos(door.yaw) * 1.5]
		});
	}
	return points;
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

/**
 * Admin: where to put a body moved to the free camera, given where its feet would be under the
 * camera. Right there when it fits, to fall from; in a wall or a floor, the free spot nearest the
 * floor below. Null when there is no floor below at all: it would fall forever.
 */
export function dropSpot(
	world: CollisionWorld,
	feet: Vec3,
	height: number,
	radius: number
): Vec3 | null {
	const [x, y, z] = feet;
	const floor = floorHeightAt(world, x, z, y + height, y - DROP_DEPTH);
	if (floor === null) return null;
	if (capsuleFits(world, feet, height, radius)) return feet;
	return findFreeSpot(world, [x, floor + 0.05, z], height, radius);
}

/** How far below the camera a floor is looked for (m): deeper than any map. */
const DROP_DEPTH = 64;
