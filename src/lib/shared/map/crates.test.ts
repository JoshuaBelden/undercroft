import { describe, expect, it } from 'vitest';
import { CRATES } from '../../content/loot.ts';
import { realMap } from '../testing/maps.ts';
import { placeCrates } from './crates.ts';
import { PIECES } from './pieces.generated.ts';
import { spawnPoint } from './points.ts';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('placeCrates', () => {
	it('is seeded: the same map gets the same crates', () => {
		const map = realMap(42);
		expect(placeCrates(map, PIECES, 42)).toEqual(placeCrates(map, PIECES, 42));
	});

	it('keeps crates away from the start and gives them unique ids', () => {
		for (const seed of SEEDS) {
			const map = realMap(seed);
			const start = spawnPoint(map, PIECES).position;
			const ids = map.crates.map((crate) => crate.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const crate of map.crates) {
				// Corpses are pushed out from their marker a little.
				const away = Math.hypot(crate.position[0] - start[0], crate.position[2] - start[2]);
				expect(away, `seed ${seed} ${crate.id}`).toBeGreaterThan(CRATES.minDistance - 0.5);
			}
		}
	});

	it('turns some crates into corpses, never all of them', () => {
		let crates = 0;
		let corpses = 0;
		for (const seed of SEEDS) {
			for (const crate of realMap(seed).crates) {
				if (crate.kind === 'corpse') corpses++;
				else crates++;
			}
		}
		expect(corpses).toBeGreaterThan(0);
		expect(crates).toBeGreaterThan(corpses);
	});
});
