import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../../content/player/movement.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { SIM_RATE } from '../constants.ts';
import { createPlayerState, idleFrame, stepPlayer } from '../player/simulate.ts';
import type { InputFrame, PlayerState } from '../player/types.ts';
import { worldOf } from '../testing/maps.ts';
import { pieceLinks } from './debug.ts';
import { generateLayout } from './generate.ts';
import { PIECES } from './pieces.generated.ts';

/**
 * The ledge hall (scripts/blender/kit.py `build_hall_ledge`): its sockets at level 1 (4 m up from
 * its origin); the north half at that height, the south half 1.1 m lower, then a shelf at the
 * south socket. In game axes the north half is z -4..0, the sunken floor z 0..3.6.
 */
const LEDGE = PIECES['hall-ledge'];
const world = worldOf(LEDGE.colliders);
const DT = 1 / SIM_RATE;

function run(s: PlayerState, input: Partial<InputFrame>, seconds: number): number {
	let lowest = Infinity;
	for (let i = 0; i < seconds * SIM_RATE; i++) {
		stepPlayer(s, { ...idleFrame(i, s), ...input, seq: i }, world, DT, MOVEMENT);
		lowest = Math.min(lowest, s.position[1]);
	}
	return lowest;
}

describe('the ledge hall', () => {
	it('is a 1x2 hall with a socket at each end, both at level 1', () => {
		expect(LEDGE.footprint).toEqual([1, 2]);
		expect(LEDGE.sockets.map((s) => s.level)).toEqual([1, 1]);
	});

	it('walking south you drop into it, and holding climb at the shelf pulls you up', () => {
		const s = createPlayerState([0, 4.05, -2], Math.PI);
		const low = run(s, { moveZ: 1, yaw: Math.PI }, 2);
		expect(low).toBeLessThan(3);
		expect(s.position[2]).toBeGreaterThan(0);
		run(s, { moveZ: 1, yaw: Math.PI, climb: true }, 1.2);
		expect(s.position[1]).toBeGreaterThan(3.9);
	});

	it('walking north, holding climb at the ledge pulls you up onto the upper half', () => {
		const s = createPlayerState([0, 2.95, 2], 0);
		run(s, {}, 0.3);
		expect(s.position[1]).toBeLessThan(3);
		run(s, { moveZ: 1, climb: true }, 2);
		expect(s.position[1]).toBeGreaterThan(3.9);
		expect(s.position[2]).toBeLessThan(0);
	});

	it('is never on the main route: only on side branches', () => {
		expect(MAP_KIT['hall-ledge'].offRoute).toBe(true);
		let used = 0;
		for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
			const layout = generateLayout(seed, PIECES, MAP_KIT);
			// Nothing a level needs is on the far side of one: every room on the route is reached
			// from the start without crossing a ledge hall (the links, ledge halls taken out).
			const links = pieceLinks(layout, PIECES);
			const seen = new Set([0]);
			const queue = [0];
			while (queue.length) {
				for (const next of links[queue.pop()!]) {
					if (seen.has(next) || layout.placements[next].piece === 'hall-ledge') continue;
					seen.add(next);
					queue.push(next);
				}
			}
			layout.placements.forEach((p, i) => {
				const role = MAP_KIT[p.piece]?.role;
				if (role === 'major' || role === 'extraction' || role === 'descent') {
					expect(seen.has(i), `seed ${seed}: ${p.piece}`).toBe(true);
				}
			});
			used += layout.placements.filter((p) => p.piece === 'hall-ledge').length;
		}
		// And they do turn up, off the route.
		expect(used).toBeGreaterThan(0);
	});
});
