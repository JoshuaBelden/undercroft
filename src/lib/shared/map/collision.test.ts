import { describe, expect, it } from 'vitest';
import { FLOOR, box, realMap, realWorld, worldOf } from '../testing/maps.ts';
import {
	capsuleFits,
	findFreeSpot,
	floorHeightAt,
	hasFloor,
	rayVsCapsule,
	segmentBlocked,
	segmentHit,
	sphereVsBox
} from './collision.ts';
import { PIECES } from './pieces.generated.ts';
import { spawnPoint } from './points.ts';

// A floor with a 1 m cube standing on it at x = 3.
const CUBE = box([3, 0.5, 0], [1, 1, 1]);
const world = worldOf([FLOOR, CUBE]);
const cube = world.boxes[1];

describe('sphereVsBox', () => {
	it('misses a sphere clear of the box', () => {
		expect(sphereVsBox([5, 0.5, 0], 0.4, cube)).toBeNull();
	});

	it('pushes a touching sphere out along the face normal', () => {
		const contact = sphereVsBox([3.8, 0.5, 0], 0.4, cube)!;
		expect(contact.normal[0]).toBeCloseTo(1);
		expect(contact.depth).toBeCloseTo(0.1);
	});

	it('pushes a sphere whose centre is inside out the nearest face', () => {
		const contact = sphereVsBox([3, 0.9, 0], 0.2, cube)!;
		expect(contact.normal[1]).toBeCloseTo(1);
		expect(contact.depth).toBeCloseTo(0.3);
	});
});

describe('segments', () => {
	it('a segment through the cube hits it where it enters', () => {
		// From x = 0 to x = 4 at mid height: the west face is at x = 2.5, shrunk by 0.02.
		expect(segmentHit(world, [0, 0.5, 0], [4, 0.5, 0])).toBeCloseTo(2.52 / 4, 3);
	});

	it('a segment over the cube is clear', () => {
		expect(segmentBlocked(world, [0, 1.5, 0], [6, 1.5, 0])).toBe(false);
	});

	it('grazing the floor does not count as blocked', () => {
		expect(segmentBlocked(world, [-5, 0.001, 0], [-1, 0.001, 0])).toBe(false);
	});
});

describe('capsules and floors', () => {
	it('a capsule fits on open floor but not inside the cube', () => {
		expect(capsuleFits(world, [0, 0, 0], 1.7, 0.3)).toBe(true);
		expect(capsuleFits(world, [3, 0, 0], 1.7, 0.3)).toBe(false);
	});

	it('hasFloor is true on the slab and false off its edge', () => {
		expect(hasFloor(world, [0, 0, 0], 0.3)).toBe(true);
		expect(hasFloor(world, [15, 0, 0], 0.3)).toBe(false);
	});

	it('floorHeightAt finds the highest walkable top in range', () => {
		expect(floorHeightAt(world, 0, 0, 2, -1)).toBeCloseTo(0);
		expect(floorHeightAt(world, 3, 0, 2, -1)).toBeCloseTo(1);
		expect(floorHeightAt(world, 3, 0, 0.5, -1)).toBeCloseTo(0);
		expect(floorHeightAt(world, 50, 0, 2, -1)).toBeNull();
	});

	it('findFreeSpot moves a body out of the cube onto the floor', () => {
		const spot = findFreeSpot(world, [3, 0, 0], 1.7, 0.3);
		expect(capsuleFits(world, spot, 1.7, 0.3)).toBe(true);
		expect(hasFloor(world, spot, 0.3)).toBe(true);
	});
});

describe('rayVsCapsule', () => {
	it('hits a capsule in front and misses one to the side', () => {
		const t = rayVsCapsule([0, 1, 0], [1, 0, 0], 20, [5, 0, 0], 1.8, 0.3);
		expect(t).not.toBeNull();
		expect(t!).toBeGreaterThan(4.5);
		expect(t!).toBeLessThan(5);
		expect(rayVsCapsule([0, 1, 0], [1, 0, 0], 20, [5, 0, 2], 1.8, 0.3)).toBeNull();
	});

	it('respects the maximum distance', () => {
		expect(rayVsCapsule([0, 1, 0], [1, 0, 0], 3, [5, 0, 0], 1.8, 0.3)).toBeNull();
	});
});

describe('real maps', () => {
	it('the spawn point has room to stand and a floor', () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const map = realMap(seed);
			const w = realWorld(map);
			const spot = findFreeSpot(w, spawnPoint(map, PIECES).position, 1.7, 0.3);
			expect(capsuleFits(w, spot, 1.7, 0.3), `seed ${seed}`).toBe(true);
			expect(hasFloor(w, spot, 0.3), `seed ${seed}`).toBe(true);
		}
	});
});
