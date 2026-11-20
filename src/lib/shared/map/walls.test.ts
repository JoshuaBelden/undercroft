import { describe, expect, it } from 'vitest';
import { FALSE_WALLS, RUBBLE_WALLS, WEBS } from '../../content/map/walls.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { buildCollisionWorld, openDoor, segmentHit } from './collision.ts';
import { pieceLinks } from './debug.ts';
import { generateLayout } from './generate.ts';
import { buildNav, gridDistances, nearestPoint } from './nav.ts';
import { PIECES } from './pieces.generated.ts';
import { entryPoint } from './points.ts';
import type { Vec3 } from './types.ts';
import { prySpots } from './walls.ts';

const SEEDS = [1, 2, 3, 4, 5];

describe('false walls', () => {
	for (const seed of SEEDS) {
		it(`seed ${seed}: each walls up a side passage of plain connectors, the only way into it`, () => {
			const layout = generateLayout(seed, PIECES, MAP_KIT, { affliction: 'gloaming' });
			const walls = layout.walls ?? [];
			expect(walls.filter((w) => !w.kind).length).toBeLessThanOrEqual(FALSE_WALLS.count);
			expect(walls.filter((w) => w.kind === 'rubble').length).toBeLessThanOrEqual(
				RUBBLE_WALLS.count
			);
			expect(walls.filter((w) => w.kind === 'web').length).toBeLessThanOrEqual(WEBS.count);
			for (const wall of walls) {
				expect(MAP_KIT[wall.piece]?.role).toBe('cap');
			}
			// The same map again: the same walls (seeded).
			expect(generateLayout(seed, PIECES, MAP_KIT, { affliction: 'gloaming' }).walls).toEqual(
				walls
			);
			// Every piece is still linked from the start: the wall hides a way, it doesn't cut a link.
			const links = pieceLinks(layout, PIECES);
			expect(links.length).toBe(layout.placements.length);
		});
	}

	it('stands solid in the way until it is opened, and nothing behind it is on the nav grid', () => {
		const seed = SEEDS.find((s) => (generateLayout(s, PIECES, MAP_KIT).walls ?? []).length)!;
		expect(seed).toBeDefined();
		const layout = generateLayout(seed, PIECES, MAP_KIT);
		const world = buildCollisionWorld(layout, PIECES);
		const [wall] = layout.walls!;
		const spot = prySpots(layout, PIECES, MAP_KIT).find((s) => s.wall === wall.id)!;
		expect(spot).toBeDefined();
		// From the near side, through the opening, to a metre past it.
		const out: Vec3 = [
			spot.position[0] + (wall.position[0] - spot.position[0]) * 5,
			spot.position[1],
			spot.position[2] + (wall.position[2] - spot.position[2]) * 5
		];
		const near: Vec3 = [
			spot.position[0] - (wall.position[0] - spot.position[0]) * 2,
			spot.position[1],
			spot.position[2] - (wall.position[2] - spot.position[2]) * 2
		];
		expect(segmentHit(world, near, out)).not.toBeNull();
		openDoor(world, wall.id);
		expect(segmentHit(world, near, out)).toBeNull();
		// The nav grid is built with it standing: the far side isn't on it.
		const shut = buildCollisionWorld(layout, PIECES);
		const root = entryPoint(shut, layout, PIECES);
		const nav = buildNav(shut, layout, PIECES, root);
		const start = nearestPoint(nav, root);
		const reach = gridDistances(nav, [start], true);
		// In the passage behind the wall (farther on can be another passage, reached some other way).
		const past: Vec3 = [
			spot.position[0] + (wall.position[0] - spot.position[0]) * 3,
			wall.position[1],
			spot.position[2] + (wall.position[2] - spot.position[2]) * 3
		];
		const beyond = nearestPoint(nav, past, 0.5);
		expect(beyond === -1 || reach[beyond] === undefined).toBe(true);
	});

	it('every cap, dead end and false wall is somewhere to try a crowbar', () => {
		const layout = generateLayout(1, PIECES, MAP_KIT);
		const spots = prySpots(layout, PIECES, MAP_KIT);
		const caps = layout.placements.filter((p) => MAP_KIT[p.piece]?.role === 'cap').length;
		const ends = layout.placements.filter((p) => MAP_KIT[p.piece]?.role === 'end').length;
		// Only false walls are pried; rubble and webs have their own ways.
		const falseWalls = (layout.walls ?? []).filter((w) => !w.kind).length;
		expect(spots.length).toBeGreaterThanOrEqual(caps + ends + falseWalls);
		expect(spots.filter((s) => s.wall).length).toBe(falseWalls);
	});
});
