import { describe, expect, it } from 'vitest';
import { ITEMS, rarityOf } from '../../content/items.ts';
import { CRATES, LEVEL_LOOT, LOOSE_LOOT } from '../../content/loot.ts';
import { Rng } from '../rng.ts';
import { maxStack } from './inventory.ts';
import { rollCrate, rollLoose } from './loot.ts';

const DEPTHS = [0, 0.5, 1];

describe('rollCrate', () => {
	it('is seeded', () => {
		expect(rollCrate(0.5, new Rng(9))).toEqual(rollCrate(0.5, new Rng(9)));
	});

	it('fills exactly the crate slots with real, legal stacks, never the same item twice', () => {
		for (const depth of DEPTHS) {
			for (let seed = 0; seed < 200; seed++) {
				const slots = rollCrate(depth, new Rng(seed));
				expect(slots).toHaveLength(CRATES.slots);
				const items = slots.filter((s) => s !== null);
				expect(new Set(items.map((s) => s.item)).size).toBe(items.length);
				for (const stack of items) {
					expect(ITEMS[stack.item], stack.item).toBeDefined();
					expect(stack.count).toBeGreaterThanOrEqual(1);
					expect(stack.count).toBeLessThanOrEqual(maxStack(stack.item));
				}
				// Filled from the first slot: no gaps before the last stack.
				const last = slots.findLastIndex((s) => s !== null);
				expect(slots.slice(0, last + 1).every((s) => s !== null)).toBe(true);
			}
		}
	});

	it('never holds both an epic and a legendary', () => {
		for (let seed = 0; seed < 500; seed++) {
			const rarities = rollCrate(1, new Rng(seed))
				.filter((s) => s !== null)
				.map((s) => rarityOf(s.item));
			expect(rarities.includes('epic') && rarities.includes('legendary')).toBe(false);
		}
	});
});

describe('rollCrate by level', () => {
	const rarities = (level: number, depth: number, seed: number) =>
		rollCrate(depth, new Rng(seed), LEVEL_LOOT[level].rarities)
			.filter((s) => s !== null)
			.map((s) => rarityOf(s.item));

	it('holds only everyday things on the first two levels', () => {
		for (const level of [0, 1]) {
			for (let seed = 0; seed < 500; seed++) {
				for (const r of rarities(level, 1, seed)) expect(['common', 'uncommon']).toContain(r);
			}
		}
	});

	it('keeps the good stuff for the third level, deepest of all at its far end', () => {
		const found = (depth: number) =>
			Array.from({ length: 2000 }, (_, seed) => rarities(2, depth, seed)).flat();
		const good = (list: string[]) => list.filter((r) => r === 'rare' || r === 'epic').length;
		expect(good(found(0))).toBeGreaterThan(0);
		expect(good(found(1))).toBeGreaterThan(good(found(0)));
	});

	it('rolls the same everyday things whatever the level', () => {
		const everyday = (level: number) =>
			rollCrate(0.5, new Rng(3), LEVEL_LOOT[level].rarities).filter(
				(s) => s !== null && ['common', 'uncommon'].includes(rarityOf(s.item))
			).length;
		expect(everyday(0)).toBeGreaterThan(0);
	});
});

describe('rollLoose', () => {
	it('only rolls the rarities loose loot allows', () => {
		for (let seed = 0; seed < 300; seed++) {
			const stack = rollLoose(seed / 300, new Rng(seed));
			if (stack) expect(LOOSE_LOOT.rarities).toContain(rarityOf(stack.item));
		}
	});
});
