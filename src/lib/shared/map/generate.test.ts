import { describe, expect, it } from 'vitest';
import { AFFLICTIONS } from '../../content/afflictions.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { realMap } from '../testing/maps.ts';
import { generateLayout } from './generate.ts';
import { cellKey, occupiedCells, placementLevel } from './grid.ts';
import { PIECES } from './pieces.generated.ts';
import type { Placement } from './types.ts';

const SEEDS = Array.from({ length: 40 }, (_, i) => (i * 2654435761) >>> 0);
const AFFLICTION_IDS = Object.keys(AFFLICTIONS);

describe('generateLayout', () => {
	it('gives the same layout for the same seed', () => {
		for (const seed of SEEDS.slice(0, 5)) expect(realMap(seed)).toEqual(realMap(seed));
	});

	it('gives different layouts for different seeds', () => {
		expect(realMap(1).placements).not.toEqual(realMap(2).placements);
	});

	for (const affliction of AFFLICTION_IDS) {
		describe(`for ${affliction}`, () => {
			const maps = SEEDS.map((seed) => realMap(seed, affliction));

			it('starts with the start room and has a final room and the extractions', () => {
				for (const map of maps) {
					const roles = map.placements.map((p) => MAP_KIT[p.piece]?.role);
					expect(roles[0]).toBe('start');
					expect(roles.filter((r) => r === 'extraction').length).toBeGreaterThanOrEqual(1);
					expect(map.placements.some((p) => MAP_KIT[p.piece]?.final)).toBe(true);
				}
			});

			it('only uses known pieces, shared or owned by this Affliction', () => {
				for (const map of maps) {
					for (const { piece } of map.placements) {
						expect(PIECES[piece], piece).toBeDefined();
						const owner = MAP_KIT[piece]?.affliction;
						expect(owner === undefined || owner === affliction, piece).toBe(true);
					}
				}
			});

			it('never puts two pieces in the same cell', () => {
				for (const map of maps) {
					const taken = new Set<string>();
					for (const placement of map.placements) {
						for (const [x, z, level] of occupiedCells(PIECES[placement.piece], placement)) {
							const key = cellKey(x, z, level);
							expect(taken.has(key), `seed ${map.seed}: ${key}`).toBe(false);
							taken.add(key);
						}
					}
				}
			});

			it('puts the final room strictly deeper than every other room', () => {
				// Rooms only (canal halls reach below their own floor), compared by the level they are
				// entered at: a pit room like the cistern is entered above its lowest level.
				const ROOMS = new Set(['start', 'major', 'extraction']);
				const entered = (p: Placement) =>
					placementLevel(p) + Math.min(...PIECES[p.piece].sockets.map((s) => s.level));
				for (const map of maps) {
					const finalRoom = map.placements.find((p) => MAP_KIT[p.piece]?.final)!;
					const others = map.placements.filter(
						(p) => p !== finalRoom && ROOMS.has(MAP_KIT[p.piece]?.role ?? '')
					);
					for (const room of others) {
						expect(entered(room), `seed ${map.seed}: ${room.piece}`).toBeGreaterThan(
							entered(finalRoom)
						);
					}
				}
			});
		});
	}

	it('throws on a kit it cannot build anything from', () => {
		expect(() => generateLayout(1, PIECES, {}, { attempts: 2 })).toThrow();
	});
});
