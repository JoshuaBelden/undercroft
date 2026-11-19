import { describe, expect, it } from 'vitest';
import { toWorld } from '../src/lib/shared/map/grid.ts';
import { gridDistances, nearestPoint } from '../src/lib/shared/map/nav.ts';
import { PIECES } from '../src/lib/shared/map/pieces.generated.ts';
import type { Vec3 } from '../src/lib/shared/map/types.ts';
import { MOVEMENT } from '../src/lib/content/player/movement.ts';
import { SIM_RATE } from '../src/lib/shared/constants.ts';
import { createPlayerState, idleFrame, stepPlayer } from '../src/lib/shared/player/simulate.ts';
import { mapFixture } from './testing/harness.ts';

/**
 * The Gloaming Chapel, the final room (scripts/blender/kit.py `build_gloaming_chapel`): one way
 * in, through its double door; the nave, and a side hall either way whose stair climbs to the
 * balcony over the door. Places in it, in the piece's own frame (game axes: x east, y up, z south).
 */
const CHAPEL = PIECES['gloaming-chapel'];
const PLACES: Record<string, Vec3> = {
	nave: [0, 0, 2],
	'west hall': [-12, 0, -0.5],
	'east hall': [12, 0, -0.5],
	balcony: [0, 4, 9.5],
	'west landing': [-10, 4, 9.5],
	'east landing': [10, 4, 9.5],
	'half way up the east stair': [16, 2, 5]
};

describe('the Gloaming Chapel', () => {
	it('has one way in, through its double door', () => {
		expect(CHAPEL.sockets).toHaveLength(1);
		expect(CHAPEL.doors).toHaveLength(1);
		expect(CHAPEL.rites).toHaveLength(1);
		expect(CHAPEL.extracts).toHaveLength(1);
	});

	for (const seed of [1, 2, 3]) {
		it(`seed ${seed}: it is the deepest room, and everywhere in it can be walked to`, () => {
			const { layout, nav } = mapFixture(seed);
			const placement = layout.placements.find((p) => p.piece === 'gloaming-chapel')!;
			expect(placement.tier).toBe(Math.max(...layout.placements.map((p) => p.tier)));
			// The nav grid only keeps floor connected to the start (doors open): the balcony is.
			for (const [name, local] of Object.entries(PLACES)) {
				const i = nearestPoint(nav, toWorld(placement, local), 1);
				expect(i, name).toBeGreaterThanOrEqual(0);
				expect(
					Math.abs(nav.points[i].position[1] - toWorld(placement, local)[1]),
					name
				).toBeLessThan(0.6);
			}
		});
	}

	it('its door shuts it off: no way in along the floor until it is opened', () => {
		const { layout, nav } = mapFixture(1);
		const placement = layout.placements.find((p) => p.piece === 'gloaming-chapel')!;
		const at = toWorld(placement, CHAPEL.doors[0].position);
		const door = layout.doors.find(
			(d) => Math.hypot(d.position[0] - at[0], d.position[2] - at[2]) < 0.01
		)!;
		expect(door).toBeDefined();
		const rite = nearestPoint(nav, toWorld(placement, CHAPEL.rites[0]), 1);
		// The way-in side of the door.
		const out: Vec3 = [-Math.sin(door.yaw), 0, -Math.cos(door.yaw)];
		const outside = nearestPoint(
			nav,
			[door.position[0] + out[0] * 2, door.position[1], door.position[2] + out[2] * 2],
			1
		);
		expect(rite).toBeGreaterThanOrEqual(0);
		expect(outside).toBeGreaterThanOrEqual(0);
		expect(nav.closed.has(door.id)).toBe(true);
		expect(gridDistances(nav, [rite])[outside]).toBeUndefined();
		expect(gridDistances(nav, [rite], true)[outside]).toBeDefined();
	});

	it('an explorer walks up either stair to the balcony', () => {
		const { layout, world } = mapFixture(1);
		const placement = layout.placements.find((p) => p.piece === 'gloaming-chapel')!;
		for (const sx of [-1, 1]) {
			// At the foot of the stair, facing up it (it climbs toward the door: +z in the piece).
			const foot = toWorld(placement, [sx * 16, 0.05, 0.5]);
			const up = toWorld(placement, [sx * 16, 0, 10]);
			const s = createPlayerState(foot, 0);
			const yaw = Math.atan2(-(up[0] - foot[0]), -(up[2] - foot[2]));
			const frame = { ...idleFrame(0, s), yaw, moveZ: 1 };
			for (let t = 0; t < 6 * SIM_RATE; t++) stepPlayer(s, frame, world, 1 / SIM_RATE, MOVEMENT);
			expect(s.position[1] - placement.position[1], sx > 0 ? 'east' : 'west').toBeGreaterThan(3.9);
		}
	});
});
