import { describe, expect, it } from 'vitest';
import { realMap, realWorld } from '../testing/maps.ts';
import { buildNav, findPath, gridDistances, lowerStance, nearestPoint, pathLength } from './nav.ts';
import { PIECES } from './pieces.generated.ts';
import { spawnPoint } from './points.ts';
import type { Vec3 } from './types.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { toWorld } from './grid.ts';

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

		it(`seed ${seed}: every point is reachable from the spawn`, () => {
			const distance = gridDistances(nav, [start]);
			const unreachable = nav.points.filter((_, i) => distance[i] === undefined);
			expect(unreachable).toHaveLength(0);
		});

		it(`seed ${seed}: neighbours are symmetric`, () => {
			nav.points.forEach((point, i) => {
				for (const n of point.neighbours) expect(nav.points[n].neighbours).toContain(i);
			});
		});

		it(`seed ${seed}: a path leads from the spawn to every way out`, () => {
			expect(world.extracts.length).toBeGreaterThan(0);
			expect(world.ropes.some((r) => r.exitY !== undefined)).toBe(true);
			const feet = world.ropes.map((r): Vec3 => [r.top[0], r.bottom, r.top[2]]);
			for (const extract of [...world.extracts, ...feet]) {
				const goal = nearestPoint(nav, extract, 4);
				expect(goal).toBeGreaterThanOrEqual(0);
				const path = findPath(nav, start, goal, 200000);
				expect(path).not.toBeNull();
				expect(path![0]).toEqual(nav.points[start].position);
				expect(path!.at(-1)).toEqual(nav.points[goal].position);
			}
		});
	}

	describe('rope drops', () => {
		// Building the nav grid takes a while: a few maps, and room for a busy machine.
		const SEEDS = [1, 2, 3, 4];
		it('every map has one, hung off the route: no room on the route needs rope to reach', () => {
			for (const seed of SEEDS) {
				const map = realMap(seed);
				const world = realWorld(map);
				const spawn = spawnPoint(map, PIECES).position;
				const nav = buildNav(world, map, PIECES, spawn);
				const drops = map.placements.filter((p) => MAP_KIT[p.piece]?.needsRope);
				expect(drops.length, `seed ${seed}`).toBeGreaterThan(0);
				for (const placement of map.placements) {
					const role = MAP_KIT[placement.piece]?.role;
					if (role !== 'major' && role !== 'extraction') continue;
					const point = nearestPoint(nav, toWorld(placement, [0, 0, 0]), 6);
					expect(point, `seed ${seed}: ${placement.piece}`).toBeGreaterThanOrEqual(0);
				}
				// ...and the foot of each drop is beyond walking: nobody gets there without rope.
				for (const anchor of world.anchors) {
					expect(anchor.top[1] - anchor.bottom).toBeGreaterThan(12);
					const near = nearestPoint(nav, [anchor.top[0], anchor.bottom, anchor.top[2]], 1.5);
					// Any point found there is up on the ledge, not down at the foot.
					const y = near < 0 ? Infinity : nav.points[near].position[1];
					expect(Math.abs(y - anchor.bottom), `seed ${seed}`).toBeGreaterThan(2);
				}
			}
		}, 30_000);
	});

	it('findPath refuses missing endpoints', () => {
		expect(findPath({ points: [], columns: new Map() }, -1, 0)).toBeNull();
	});
});
