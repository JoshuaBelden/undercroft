import { describe, expect, it } from 'vitest';
import { DOORS } from '../../content/doors.ts';
import { realMap, realWorld } from '../testing/maps.ts';
import { openDoor, segmentHit } from './collision.ts';
import { doorBox, lookedAtDoor, tierAt, tierCells } from './doors.ts';
import { PIECES } from './pieces.generated.ts';
import { spawnPoint } from './points.ts';
import type { Vec3 } from './types.ts';

const map = realMap(7);

/** An eye on the room side of a door, `back` metres out, and the unit look at its middle. */
function before(index: number, back: number): { eye: Vec3; look: Vec3 } {
	const door = map.doors[index];
	const { center } = doorBox(door);
	const eye: Vec3 = [
		center[0] - Math.sin(door.yaw) * back,
		center[1] + 0.3,
		center[2] - Math.cos(door.yaw) * back
	];
	const to: Vec3 = [center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]];
	const d = Math.hypot(...to);
	return { eye, look: [to[0] / d, to[1] / d, to[2] / d] };
}

describe('doors', () => {
	it('stand at the top of each long stair, on the level they lead to, and into the final room', () => {
		expect(map.doors.map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
		// Two long stairs (to levels 1 and 2), then the Gloaming Chapel's, on the deepest.
		expect(map.doors.map((d) => d.tier)).toEqual([1, 2, 2]);
		const chapel = map.placements.find((p) => p.piece === 'gloaming-chapel')!;
		expect(map.placements.indexOf(chapel)).toBeGreaterThan(
			map.placements.findLastIndex((p) => p.piece === 'stairs-deep')
		);
	});

	it('are looked at from the room side within reach, and not once open', () => {
		const world = realWorld(map);
		const near = before(0, 1.2);
		const shut = () => false;
		expect(lookedAtDoor(world, near.eye, near.look, map.doors, shut)?.id).toBe('d1');
		const far = before(0, DOORS.reach + 1);
		expect(lookedAtDoor(world, far.eye, far.look, map.doors, shut)).toBeNull();
		expect(lookedAtDoor(world, near.eye, near.look, map.doors, () => true)).toBeNull();
	});

	it('block the doorway until opened', () => {
		const world = realWorld(map);
		const { eye, look } = before(0, 1.2);
		const past: Vec3 = [eye[0] + look[0] * 3, eye[1], eye[2] + look[2] * 3];
		expect(segmentHit(world, eye, past)).not.toBeNull();
		openDoor(world, 'd1');
		expect(segmentHit(world, eye, past)).toBeNull();
	});

	it('tell which level of the map a place is on', () => {
		const cells = tierCells(map, PIECES);
		expect(tierAt(cells, spawnPoint(map, PIECES).position)).toBe(0);
		for (const door of map.doors) {
			// Just past the door, at the top of the stair: the level it leads to.
			expect(tierAt(cells, door.position)).toBe(door.tier);
		}
		expect(tierAt(cells, [9999, 0, 9999])).toBeNull();
	});
});
