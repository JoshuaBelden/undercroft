import { DOORS, GATES } from '../../content/doors.ts';
import { segmentHit, type CollisionWorld } from './collision.ts';
import { LEVEL_HEIGHT, cellKey, occupiedCells, toWorld, worldCell } from './grid.ts';
import type { DoorMarker, DoorPlacement, MapLayout, PieceDef, Vec3 } from './types.ts';

/**
 * Doors (between levels, and into the final room), and which level of the map a place is on. See
 * docs/dev/map-generation.md#levels and #doors.
 */

const round = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Every door-* and gate-* marker in the map, in world space, numbered in layout order (`d1`,
 * `d2`...). A gate is a door with a lock (`kind: 'gate'`).
 */
export function placeDoors(layout: MapLayout, pieces: Record<string, PieceDef>): DoorPlacement[] {
	const doors: DoorPlacement[] = [];
	for (const placement of layout.placements) {
		const def = pieces[placement.piece];
		const markers: { marker: DoorMarker; gate: boolean }[] = [
			...(def?.doors ?? []).map((marker) => ({ marker, gate: false })),
			...(def?.gates ?? []).map((marker) => ({ marker, gate: true }))
		];
		for (const { marker, gate } of markers) {
			doors.push({
				id: `d${doors.length + 1}`,
				piece: placement.piece,
				position: toWorld(placement, marker.position).map(round) as Vec3,
				yaw: round(marker.yaw + (placement.rotation * Math.PI) / 2),
				tier: placement.tier,
				...(gate ? { kind: 'gate' as const } : {}),
				...(marker.key ? { key: marker.key } : {}),
				...(marker.size ? { size: marker.size } : {}),
				...(marker.marker ? { marker: marker.marker } : {})
			});
		}
	}
	return doors;
}

/** A door's solid box while shut: centre, half extents, and its turn about +Y. */
export function doorBox(door: Pick<DoorPlacement, 'position' | 'yaw' | 'kind' | 'size'>): {
	center: Vec3;
	half: Vec3;
	yaw: number;
} {
	const [w, h, d] = doorSize(door);
	return {
		center: [door.position[0], door.position[1] + h / 2, door.position[2]],
		half: [w / 2, h / 2, d / 2],
		yaw: door.yaw
	};
}

/** A door's collision box (across, high, deep): its own, a gate's, or the double door's. */
export function doorSize(door: Pick<DoorPlacement, 'kind' | 'size'>): Vec3 {
	return door.size ?? (door.kind === 'gate' ? GATES.size : DOORS.size);
}

/** Where the ray from `eye` along `look` (unit) enters the door's box, or null if it misses. */
function rayIntoDoor(door: DoorPlacement, eye: Vec3, look: Vec3): number | null {
	const { center, half, yaw } = doorBox(door);
	// Into the door's own frame: undo its turn about +Y.
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	const toLocal = (v: Vec3): Vec3 => [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c];
	const o = toLocal([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
	const dir = toLocal(look);
	let near = -Infinity;
	let far = Infinity;
	for (let a = 0; a < 3; a++) {
		if (Math.abs(dir[a]) < 1e-9) {
			if (Math.abs(o[a]) > half[a]) return null;
			continue;
		}
		const t1 = (-half[a] - o[a]) / dir[a];
		const t2 = (half[a] - o[a]) / dir[a];
		near = Math.max(near, Math.min(t1, t2));
		far = Math.min(far, Math.max(t1, t2));
	}
	return near <= far && far >= 0 ? Math.max(0, near) : null;
}

/**
 * The shut door a player is looking at within reach, if nothing stands in between. Shared so the
 * client prompts for exactly the door the server will open.
 */
export function lookedAtDoor(
	world: CollisionWorld,
	eye: Vec3,
	look: Vec3,
	doors: Iterable<DoorPlacement>,
	isOpen: (id: string) => boolean
): DoorPlacement | null {
	let best: DoorPlacement | null = null;
	let bestT = Infinity;
	for (const door of doors) {
		if (isOpen(door.id)) continue;
		const t = rayIntoDoor(door, eye, look);
		if (t === null || t > DOORS.reach || t >= bestT) continue;
		// Nothing else in the way: stop just short of the door, which is solid itself.
		const short = Math.max(0, t - 0.05);
		const end: Vec3 = [
			eye[0] + look[0] * short,
			eye[1] + look[1] * short,
			eye[2] + look[2] * short
		];
		if (short > 0 && segmentHit(world, eye, end) !== null) continue;
		best = door;
		bestT = t;
	}
	return best;
}

/** Grid floor of a world height: the one whose floor is at or just below it. */
function floorOf(y: number): number {
	return Math.floor((y + 0.5) / LEVEL_HEIGHT);
}

/** Which level of the map (tier) each occupied cell is on: "x,z,floor" -> tier. */
export function tierCells(
	layout: MapLayout,
	pieces: Record<string, PieceDef>
): Map<string, number> {
	const cells = new Map<string, number>();
	for (const placement of layout.placements) {
		const piece = pieces[placement.piece];
		if (!piece) continue;
		for (const [x, z, level] of occupiedCells(piece, placement)) {
			const key = cellKey(x, z, level);
			// A cell two pieces claim (never, but a cap at its edge has none) keeps the first.
			if (!cells.has(key)) cells.set(key, placement.tier);
		}
	}
	return cells;
}

/** The level of the map (tier) a world position is on, or null outside the map. */
export function tierAt(cells: Map<string, number>, position: Vec3): number | null {
	const [x, z] = worldCell(position[0], position[2]);
	return cells.get(cellKey(x, z, floorOf(position[1]))) ?? null;
}
