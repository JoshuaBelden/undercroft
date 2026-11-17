import { describe, expect, it } from 'vitest';
import { BENCHMARK } from '#lib/content/diagnostics.ts';
import { MAP_KIT } from '#lib/content/map/kit.ts';
import { pathLength } from '#lib/shared/map/nav.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import { generateLayout } from '#lib/shared/map/generate.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import { benchmarkRoute, pointAlong } from './route.ts';

/** The map as the benchmark builds it: the layout alone, no crates. */
const benchMap = () =>
	generateLayout(BENCHMARK.seed, PIECES, MAP_KIT, { affliction: BENCHMARK.affliction });

describe('benchmarkRoute', () => {
	it('walks far enough on the benchmark map, in small steps (never through a wall)', () => {
		const layout = benchMap();
		const route = benchmarkRoute(layout, PIECES, MAP_KIT, 40);
		expect(pathLength(route)).toBeGreaterThanOrEqual(40);
		for (let i = 1; i < route.length; i++) {
			const [a, b] = [route[i - 1], route[i]];
			// Nav-grid neighbours: half a metre apart, diagonals and stair steps included.
			expect(Math.hypot(b[0] - a[0], b[2] - a[2])).toBeLessThan(0.8);
		}
	});

	it('is the same route every time', () => {
		const layout = benchMap();
		expect(benchmarkRoute(layout, PIECES, MAP_KIT, 30)).toEqual(
			benchmarkRoute(layout, PIECES, MAP_KIT, 30)
		);
	});
});

describe('pointAlong', () => {
	const route: Vec3[] = [
		[0, 0, 0],
		[10, 0, 0],
		[10, 0, 10]
	];

	it('interpolates along the legs, heading along each', () => {
		expect(pointAlong(route, 5)).toEqual({ position: [5, 0, 0], heading: [1, 0, 0] });
		expect(pointAlong(route, 15)).toEqual({ position: [10, 0, 5], heading: [0, 0, 1] });
	});

	it('turns back past the end, and before the start', () => {
		expect(pointAlong(route, 25)).toEqual({ position: [10, 0, 5], heading: [-0, -0, -1] });
		expect(pointAlong(route, -5).position).toEqual([5, 0, 0]);
	});

	it('copes with a route of one point', () => {
		expect(pointAlong([[1, 2, 3]], 7).position).toEqual([1, 2, 3]);
	});
});
