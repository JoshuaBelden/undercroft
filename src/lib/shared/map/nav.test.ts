import { describe, expect, it } from 'vitest';
import { realMap, realWorld } from '../testing/maps.ts';
import { openDoor } from './collision.ts';
import { tierAt, tierCells } from './doors.ts';
import { buildNav, findPath, gridDistances, lowerStance, nearestPoint, pathLength } from './nav.ts';
import { PIECES } from './pieces.generated.ts';
import { spawnPoint } from './points.ts';

describe('lowerStance', () => {
	it('picks the lower posture either way round', () => {
		expect(lowerStance('stand', 'crouch')).toBe('crouch');
		expect(lowerStance('crawl', 'crouch')).toBe('crawl');
		expect(lowerStance('stand', 'stand')).toBe('stand');
	});
});

describe('pathLength', () => {
	it('sums the segment lengths', () => {
		expect(pathLength([])).toBe(0);
		expect(
			pathLength([
				[0, 0, 0],
				[3, 0, 4],
				[3, 0, 10]
			])
		).toBeCloseTo(11);
	});
});

describe('nav grid on real maps', () => {
	for (const seed of [11, 22, 33]) {
		const map = realMap(seed);
		const world = realWorld(map);
		const spawn = spawnPoint(map, PIECES).position;
		const nav = buildNav(world, map, PIECES, spawn);
		const start = nearestPoint(nav, spawn);

		it(`seed ${seed}: the spawn is on the grid`, () => {
			expect(nav.points.length).toBeGreaterThan(100);
			expect(start).toBeGreaterThanOrEqual(0);
		});

		it(`seed ${seed}: every point is reachable from the spawn, through the doors`, () => {
			const distance = gridDistances(nav, [start], true);
			const unreachable = nav.points.filter((_, i) => distance[i] === undefined);
			expect(unreachable).toHaveLength(0);
		});

		it(`seed ${seed}: shut doors keep paths on the first level`, () => {
			expect(nav.closed).toEqual(new Set(map.doors.map((door) => door.id)));
			const tiers = tierCells(map, PIECES);
			const distance = gridDistances(nav, [start]);
			nav.points.forEach((point, i) => {
				if (distance[i] !== undefined) expect(tierAt(tiers, point.position)).not.toBe(2);
			});
			const below = nav.points.findIndex((p) => tierAt(tiers, p.position) === 2);
			expect(below).toBeGreaterThanOrEqual(0);
			expect(findPath(nav, start, below, 200000)).toBeNull();
		});

		it(`seed ${seed}: neighbours are symmetric`, () => {
			nav.points.forEach((point, i) => {
				for (const n of point.neighbours) expect(nav.points[n].neighbours).toContain(i);
			});
		});

		it(`seed ${seed}: with the doors open, a path leads from the spawn to every extraction`, () => {
			for (const door of map.doors) {
				openDoor(world, door.id);
				nav.closed.delete(door.id);
			}
			expect(world.extracts.length).toBe(4);
			for (const extract of world.extracts) {
				const goal = nearestPoint(nav, extract, 4);
				expect(goal).toBeGreaterThanOrEqual(0);
				const path = findPath(nav, start, goal, 200000);
				expect(path).not.toBeNull();
				expect(path![0]).toEqual(nav.points[start].position);
				expect(path!.at(-1)).toEqual(nav.points[goal].position);
			}
		});
	}

	it('findPath refuses missing endpoints', () => {
		expect(findPath({ points: [], columns: new Map(), closed: new Set() }, -1, 0)).toBeNull();
	});
});
