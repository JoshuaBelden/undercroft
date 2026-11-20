import { describe, expect, it } from 'vitest';
import { ITEMS, rarityOf } from '../../content/items.ts';
import { LOOSE_LOOT } from '../../content/loot.ts';
import { LOOTABLES, LOOT_BUDGET, PENDING_ITEMS } from '../../content/lootables.ts';
import { Rng } from '../rng.ts';
import { maxStack, newStack, type Slots } from './inventory.ts';
import { liveEntries, rollLoose, rollLootable, treasureValue, trimToBudget } from './loot.ts';

const DEPTHS = [0, 0.5, 1];
const CRATE = LOOTABLES.crate;

const items = (slots: Slots) => slots.filter((s) => s !== null);
const rarities = (slots: Slots) => items(slots).map((s) => rarityOf(s.item));

describe('the loot tables', () => {
	it('name items in the game, or ones still to come, never both', () => {
		for (const def of Object.values(LOOTABLES)) {
			for (const entry of def.loot) {
				const live = Object.hasOwn(ITEMS, entry.item);
				expect(live !== PENDING_ITEMS.has(entry.item), `${def.id}: ${entry.item}`).toBe(true);
				expect(entry.count[0]).toBeGreaterThanOrEqual(1);
				expect(entry.count[1]).toBeGreaterThanOrEqual(entry.count[0]);
			}
		}
	});

	it('every pending item is still named by some table', () => {
		const named = new Set(Object.values(LOOTABLES).flatMap((def) => def.loot.map((e) => e.item)));
		for (const item of PENDING_ITEMS) expect(named.has(item), item).toBe(true);
	});

	it('every lootable has its own id, slots, and counts for every level', () => {
		for (const [id, def] of Object.entries(LOOTABLES)) {
			expect(def.id).toBe(id);
			// Filled from (a font): no slots, no ways to open.
			if (def.fill) continue;
			expect(def.slots).toBeGreaterThan(0);
			expect(def.rarity).toHaveLength(LOOT_BUDGET.length);
			if (def.sealed?.rarity) expect(def.sealed.rarity).toHaveLength(LOOT_BUDGET.length);
			expect(def.open.length + (def.sealed?.open.length ?? 0)).toBeGreaterThan(0);
			expect(def.flavor.length).toBeGreaterThan(0);
		}
	});

	it('leaves the lines for items still to come out of the roll', () => {
		const live = liveEntries(LOOTABLES.cache.loot);
		expect(live.every((e) => Object.hasOwn(ITEMS, e.item))).toBe(true);
		expect(live.length).toBeLessThan(LOOTABLES.cache.loot.length);
	});
});

describe('rollLootable', () => {
	it('is seeded', () => {
		expect(rollLootable(CRATE, 2, 0.5, new Rng(9))).toEqual(
			rollLootable(CRATE, 2, 0.5, new Rng(9))
		);
	});

	it('fills its own slots with real, legal stacks, never the same item twice', () => {
		for (const def of Object.values(LOOTABLES)) {
			for (const depth of DEPTHS) {
				for (let seed = 0; seed < 60; seed++) {
					const slots = rollLootable(def, 2, depth, new Rng(seed));
					expect(slots).toHaveLength(def.slots);
					const found = items(slots);
					expect(new Set(found.map((s) => s.item)).size).toBe(found.length);
					for (const stack of found) {
						expect(ITEMS[stack.item], stack.item).toBeDefined();
						expect(stack.count).toBeGreaterThanOrEqual(1);
						expect(stack.count).toBeLessThanOrEqual(maxStack(stack.item));
					}
					// Filled from the first slot: no gaps before the last stack.
					const last = slots.findLastIndex((s) => s !== null);
					expect(slots.slice(0, last + 1).every((s) => s !== null)).toBe(true);
				}
			}
		}
	});

	it('never holds both an epic and a legendary', () => {
		for (let seed = 0; seed < 500; seed++) {
			const found = rarities(rollLootable(CRATE, 2, 1, new Rng(seed)));
			expect(found.includes('epic') && found.includes('legendary')).toBe(false);
		}
	});

	it('a crate holds only everyday things on the first two levels', () => {
		for (const tier of [0, 1]) {
			for (let seed = 0; seed < 500; seed++) {
				for (const r of rarities(rollLootable(CRATE, tier, 1, new Rng(seed)))) {
					expect(['common', 'uncommon']).toContain(r);
				}
			}
		}
	});

	it('keeps the good stuff for the third level, deepest of all at its far end', () => {
		const found = (depth: number) =>
			Array.from({ length: 2000 }, (_, seed) =>
				rarities(rollLootable(CRATE, 2, depth, new Rng(seed)))
			).flat();
		const good = (list: string[]) => list.filter((r) => r === 'rare' || r === 'epic').length;
		expect(good(found(0))).toBeGreaterThan(0);
		expect(good(found(1))).toBeGreaterThan(good(found(0)));
	});

	it('a trunk always holds something epic or legendary', () => {
		for (let seed = 0; seed < 300; seed++) {
			const found = rarities(rollLootable(LOOTABLES.trunk, 1, 0, new Rng(seed)));
			expect(found.some((r) => r === 'epic' || r === 'legendary')).toBe(true);
		}
	});

	it('a reliquary alcove holds one legendary thing and nothing else', () => {
		for (let seed = 0; seed < 100; seed++) {
			expect(rarities(rollLootable(LOOTABLES.alcove, 2, 0.5, new Rng(seed)))).toEqual([
				'legendary'
			]);
		}
	});

	it('a sealed niche holds better things than an open one', () => {
		const best = (sealed: boolean) =>
			Array.from({ length: 1000 }, (_, seed) =>
				rarities(rollLootable(LOOTABLES.niche, 1, 0.5, new Rng(seed), sealed))
			)
				.flat()
				.filter((r) => r !== 'common').length;
		expect(best(true)).toBeGreaterThan(best(false));
	});
});

describe('the budget', () => {
	it('takes treasure out until a level is within it, leaving the rest alone', () => {
		const budget = LOOT_BUDGET[0];
		const rich: Slots[] = Array.from({ length: 12 }, () => [
			newStack('relic'),
			newStack('bandage', 2),
			null
		]);
		expect(rich.reduce((sum, slots) => sum + treasureValue(slots), 0)).toBeGreaterThan(budget);
		const taken = trimToBudget(rich, 0, new Rng(4));
		expect(taken).toBeGreaterThan(0);
		expect(rich.reduce((sum, slots) => sum + treasureValue(slots), 0)).toBeLessThanOrEqual(budget);
		// Everything that isn't treasure is still there.
		expect(rich.every((slots) => slots[1]?.item === 'bandage')).toBe(true);
	});

	it('never takes what is kept on purpose', () => {
		const slots: Slots[] = [[newStack('relic'), newStack('relic'), newStack('relic')]];
		trimToBudget(slots, 0, new Rng(1), () => true);
		expect(items(slots[0])).toHaveLength(3);
	});

	it('changes nothing within the budget', () => {
		const slots: Slots[] = [[newStack('coins', 5), null]];
		expect(trimToBudget(slots, 0, new Rng(1))).toBe(0);
		expect(slots[0][0]?.count).toBe(5);
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
