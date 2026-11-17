import { describe, expect, it } from 'vitest';
import { AFFLICTIONS } from '../../content/afflictions.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { realMap } from '../testing/maps.ts';
import { pieceLinks } from './debug.ts';
import { generateLayout } from './generate.ts';
import { cellKey, occupiedCells, placementLevel } from './grid.ts';
import { PIECES } from './pieces.generated.ts';
import type { MapLayout, Placement } from './types.ts';

/** Pieces (not caps) that can't be walked to from the start room. */
function unreached(map: MapLayout, links: Set<number>[]): string[] {
	const seen = new Set([0]);
	const queue = [0];
	while (queue.length)
		for (const n of links[queue.pop()!]) if (!seen.has(n) && queue.push(n)) seen.add(n);
	return map.placements
		.filter((p, i) => !seen.has(i) && MAP_KIT[p.piece]?.role !== 'cap')
		.map((p) => p.piece);
}

/** Placements that can be walked to from the start room without going down a rope drop. */
function onFoot(map: MapLayout, links: Set<number>[]): Set<number> {
	const seen = new Set([0]);
	const queue = [0];
	while (queue.length) {
		for (const n of links[queue.pop()!]) {
			if (seen.has(n) || MAP_KIT[map.placements[n].piece]?.needsRope) continue;
			seen.add(n);
			queue.push(n);
		}
	}
	return seen;
}

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

			it('has three levels, each ending in an extraction room with the long stair down', () => {
				for (const map of maps) {
					const links = pieceLinks(map, PIECES);
					const of = (role: string) =>
						map.placements.filter((p) => MAP_KIT[p.piece]?.role === role);
					expect(new Set(map.placements.map((p) => p.tier))).toEqual(new Set([0, 1, 2]));
					expect(
						of('extraction')
							.map((p) => p.tier)
							.sort()
					).toEqual([0, 1]);
					expect(
						of('descent')
							.map((p) => p.tier)
							.sort()
					).toEqual([1, 2]);
					for (const stair of of('descent')) {
						const above = [...links[map.placements.indexOf(stair)]].map((i) => map.placements[i]);
						const room = above.find((p) => MAP_KIT[p.piece]?.role === 'extraction');
						expect(room?.tier, `seed ${map.seed}`).toBe(stair.tier - 1);
					}
				}
			});

			it('puts the final room on the deepest level, and a major room on every level', () => {
				for (const map of maps) {
					expect(map.placements.find((p) => MAP_KIT[p.piece]?.final)?.tier).toBe(2);
					for (const tier of [0, 1, 2]) {
						const majors = map.placements.filter(
							(p) => p.tier === tier && MAP_KIT[p.piece]?.role === 'major'
						);
						expect(majors.length, `seed ${map.seed} level ${tier}`).toBeGreaterThan(0);
					}
				}
			});

			it('puts every level strictly below the one above it', () => {
				// Compared by the level a piece is entered at: a pit room like the cistern, or a canal,
				// is entered above its lowest level. The start room sits above the first level. A rope drop
				// goes down as far as the long stair, so it and the way on at its foot are left out: they
				// stay on the level they hang from and never open into the one below (the next test), but
				// they reach as deep as it.
				const entered = (p: Placement) =>
					placementLevel(p) + Math.min(...PIECES[p.piece].sockets.map((s) => s.level));
				for (const map of maps) {
					const walked = onFoot(map, pieceLinks(map, PIECES));
					const pieces = map.placements.filter(
						(p, i) =>
							i > 0 && walked.has(i) && !['descent', 'cap'].includes(MAP_KIT[p.piece]?.role ?? '')
					);
					for (const tier of [0, 1]) {
						const lowest = Math.min(...pieces.filter((p) => p.tier === tier).map(entered));
						const highest = Math.max(...pieces.filter((p) => p.tier === tier + 1).map(entered));
						expect(highest, `seed ${map.seed}`).toBeLessThan(lowest);
					}
				}
			});

			it('joins levels only through the long stair, and reaches every piece', () => {
				for (const map of maps) {
					const links = pieceLinks(map, PIECES);
					links.forEach((others, i) => {
						for (const j of others) {
							const [a, b] = [map.placements[i], map.placements[j]];
							if (a.tier === b.tier) continue;
							const roles = [a, b].map((p) => MAP_KIT[p.piece]?.role).sort();
							expect(roles, `seed ${map.seed}`).toEqual(['descent', 'extraction']);
						}
					});
					expect(unreached(map, links), `seed ${map.seed}`).toEqual([]);
				}
			});

			it('never has a passage that leaves a room or junction and comes back into it', () => {
				for (const map of maps) {
					const links = pieceLinks(map, PIECES);
					const passage = (i: number) => {
						const entry = MAP_KIT[map.placements[i].piece];
						return (
							entry?.role === 'connector' &&
							!entry.room &&
							PIECES[map.placements[i].piece].sockets.length === 2
						);
					};
					links.forEach((others, from) => {
						if (passage(from)) return;
						for (const first of others) {
							// Follow the passage out of `from` to whatever it leads to.
							let [prev, at] = [from, first];
							while (passage(at)) {
								const next = [...links[at]].find((n) => n !== prev);
								if (next === undefined) break;
								[prev, at] = [at, next];
							}
							expect(at, `seed ${map.seed}: ${map.placements[from].piece}`).not.toBe(from);
						}
					});
				}
			});
		});
	}

	it('throws on a kit it cannot build anything from', () => {
		expect(() => generateLayout(1, PIECES, {}, { attempts: 2 })).toThrow();
	});
});
