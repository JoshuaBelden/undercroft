import { describe, expect, it } from 'vitest';
import { MAP_KIT } from '../../content/map/kit.ts';
import { emptyInventory, newStack } from '../items/inventory.ts';
import { realMap, realWorld } from '../testing/maps.ts';
import { mapDebugGrid } from './debug.ts';
import { segmentBlocked } from './collision.ts';
import { CELL, EDGE_DIR, LEVEL_HEIGHT, OPPOSITE, cellKey } from './grid.ts';
import { PIECES } from './pieces.generated.ts';
import { spawnPoint } from './points.ts';
import { carriesSurvey, cellAt, sketchCells, surveyMap, type SurveyMap } from './survey.ts';
import type { Edge, Vec3 } from './types.ts';

const SEEDS = [1, 42, 9001];

/** Steps from `from` to every cell it can walk to. */
function distances(map: SurveyMap, from: string): Map<string, number> {
	const seen = new Map([[from, 0]]);
	let frontier = [from];
	while (frontier.length) {
		const next: string[] = [];
		for (const key of frontier) {
			for (const other of map.cells.get(key)!.next) {
				if (seen.has(other)) continue;
				seen.set(other, seen.get(key)! + 1);
				next.push(other);
			}
		}
		frontier = next;
	}
	return seen;
}

describe('surveyMap', () => {
	it('has every cell the pieces fill, and agrees on each side from both cells', () => {
		for (const seed of SEEDS) {
			const layout = realMap(seed);
			const map = surveyMap(layout, PIECES, MAP_KIT);
			expect(map.cells.size).toBe(mapDebugGrid(layout, PIECES, MAP_KIT).counts.cells);
			for (const info of map.cells.values()) {
				const [x, z, level] = info.cell;
				for (const edge of Object.keys(info.sides) as Edge[]) {
					const [dx, dz] = EDGE_DIR[edge];
					const across = map.cells.get(cellKey(x + dx, z + dz, level));
					if (info.sides[edge] === 'wall') continue;
					expect(across?.sides[OPPOSITE[edge]]).toBe(info.sides[edge]);
				}
			}
		}
	});

	it('has a way through at each connected entrance and into each dead end, none at caps', () => {
		const layout = realMap(42);
		const map = surveyMap(layout, PIECES, MAP_KIT);
		const connected = mapDebugGrid(layout, PIECES, MAP_KIT).entrances.filter(
			(e) => e.state === 'connected'
		).length;
		const deadEnds = layout.placements.filter((p) => MAP_KIT[p.piece]?.role === 'end').length;
		const ways = [...map.cells.values()]
			.flatMap((c) => Object.values(c.sides))
			.filter((side) => side === 'way');
		// Each way is counted from both cells beside it.
		expect(ways.length).toBe((connected + deadEnds) * 2);
	});

	it('can walk from the start to every cell', () => {
		for (const seed of SEEDS) {
			const layout = realMap(seed);
			const map = surveyMap(layout, PIECES, MAP_KIT);
			const start = cellAt(map, spawnPoint(layout, PIECES).position)!;
			expect(start).not.toBeNull();
			expect(distances(map, start).size).toBe(map.cells.size);
		}
	});

	it('draws stairs both ways, the way out, and names the rooms', () => {
		const layout = realMap(1);
		const map = surveyMap(layout, PIECES, MAP_KIT);
		const placed = (test: (piece: string) => boolean) =>
			layout.placements.filter((p) => test(p.piece)).length;
		const kinds = (kind: string) => map.features.filter((f) => f.kind === kind);
		const stairs = placed((piece) => MAP_KIT[piece]?.descends === true);
		expect(stairs).toBeGreaterThan(0);
		expect(kinds('down')).toHaveLength(stairs);
		expect(kinds('up')).toHaveLength(stairs);
		for (const down of kinds('down')) {
			const up = kinds('up').find((f) => f.piece === down.piece)!;
			expect(up.level).toBeLessThan(down.level);
		}
		expect(kinds('extraction')).toHaveLength(
			placed((piece) => MAP_KIT[piece]?.role === 'extraction')
		);
		expect(map.rooms.map((r) => r.title)).toContain('The Stairwell');
		expect(map.levels[0]).toBe(0);
		expect(map.levels.length).toBeGreaterThan(1);
	});
});

describe('sketchCells', () => {
	const layout = realMap(42);
	const world = realWorld(layout);
	const map = surveyMap(layout, PIECES, MAP_KIT);
	const feet = spawnPoint(layout, PIECES).position;
	const eye: Vec3 = [feet[0], feet[1] + 1.6, feet[2]];

	it('draws where you stand, and only cells in clear sight within the range', () => {
		const start = cellAt(map, feet)!;
		const drawn = sketchCells(map, world, feet, eye, 12);
		expect(drawn).toContain(start);
		expect(drawn.length).toBeGreaterThan(1);
		const steps = distances(map, start);
		for (const key of drawn) {
			if (key === start) continue;
			const [x, z, level] = map.cells.get(key)!.cell;
			const middle: Vec3 = [x * CELL, level * LEVEL_HEIGHT + 1.4, z * CELL];
			expect(
				Math.hypot(middle[0] - eye[0], middle[1] - eye[1], middle[2] - eye[2])
			).toBeLessThanOrEqual(12);
			expect(segmentBlocked(world, eye, middle)).toBe(false);
			expect(steps.has(key)).toBe(true);
		}
	});

	it("doesn't draw the rest of a room you can't see", () => {
		// A big room, from the middle of one of its cells: with no range, only that cell.
		const room = layout.placements.findIndex((p) => MAP_KIT[p.piece]?.role === 'major');
		const [key, info] = [...map.cells].find(([, c]) => c.piece === room)!;
		const [x, z, level] = info.cell;
		const at: Vec3 = [x * CELL, level * LEVEL_HEIGHT, z * CELL];
		const own = [...map.cells.values()].filter((c) => c.piece === room).length;
		expect(own).toBeGreaterThan(1);
		expect(sketchCells(map, world, at, [at[0], at[1] + 1.6, at[2]], 0)).toEqual([key]);
	});

	it('draws more the further it reaches, and nothing off the map', () => {
		expect(sketchCells(map, world, feet, eye, 4).length).toBeLessThan(
			sketchCells(map, world, feet, eye, 12).length
		);
		expect(sketchCells(map, world, [9999, 0, 9999], [9999, 1.6, 9999], 12)).toEqual([]);
	});
});

describe('carriesSurvey', () => {
	it('needs a notebook somewhere in the pack', () => {
		const inventory = emptyInventory();
		expect(carriesSurvey(inventory)).toBe(false);
		inventory.backpack[0] = newStack('notebook');
		expect(carriesSurvey(inventory)).toBe(true);
	});
});
