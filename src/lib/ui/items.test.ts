import { describe, expect, it } from 'vitest';
import { ITEMS } from '#lib/content/items.ts';
import { newStack } from '#lib/shared/items/inventory.ts';
import { FILTER_ORDER, filterOf, matchesFilter, sortItems, stackCondition } from './items.ts';

describe('sortItems', () => {
	// Real items: three of different kinds and names, each given a made-up worth.
	const ids = Object.keys(ITEMS);
	const pick = (test: (id: string) => boolean): string => ids.find(test)!;
	const weapon = pick((key) => filterOf(key) === 'weapon');
	const material = pick((key) => filterOf(key) === 'material');
	const treasure = pick((key) => filterOf(key) === 'treasure');
	const placed = [
		{ item: treasure, worth: 5 },
		{ item: material, worth: 50 },
		{ item: weapon, worth: 20 }
	];
	const order = (sort: Parameters<typeof sortItems>[1]): string[] =>
		sortItems(
			placed,
			sort,
			(e) => e.item,
			(e) => e.worth
		).map((e) => e.item);

	it('keeps them as placed', () => {
		expect(order('placed')).toEqual([treasure, material, weapon]);
	});

	it('puts the dearest first', () => {
		expect(order('value')).toEqual([material, weapon, treasure]);
	});

	it('orders by name', () => {
		const names = order('name').map((id) => ITEMS[id].name);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});

	it('orders by type as the filters are listed', () => {
		expect(order('type')).toEqual([weapon, material, treasure]);
		expect(FILTER_ORDER.indexOf('weapon')).toBeLessThan(FILTER_ORDER.indexOf('material'));
	});

	it('leaves what it was given alone', () => {
		order('value');
		expect(placed.map((e) => e.item)).toEqual([treasure, material, weapon]);
	});
});

describe('filterOf', () => {
	it('agrees with matchesFilter for every item', () => {
		for (const id of Object.keys(ITEMS)) expect(matchesFilter(id, filterOf(id))).toBe(true);
	});
});

/** Something that wears by whole uses and lasts a while, from the real content. */
const id = Object.keys(ITEMS).find((key) => (ITEMS[key].durability?.max ?? 0) >= 10)!;
const max = ITEMS[id].durability!.max;

describe('stackCondition', () => {
	it('reads what is left of the most it can take, never full when worn nor 0 while it works', () => {
		expect(stackCondition(newStack(id))?.readout).toBe(`${max}/${max}`);
		expect(stackCondition({ ...newStack(id), worn: 3 })?.readout).toBe(`${max - 3}/${max}`);
		expect(stackCondition({ ...newStack(id), worn: 0.2 })?.readout).toBe(`${max - 1}/${max}`);
		expect(stackCondition({ ...newStack(id), worn: max - 0.2 })?.readout).toBe(`1/${max}`);
		const broken = stackCondition({ ...newStack(id), worn: max });
		expect(broken).toMatchObject({ readout: `0/${max}`, broken: true });
	});

	it('is nothing for things that never wear', () => {
		const lasting = Object.keys(ITEMS).find(
			(key) => !ITEMS[key].durability && !ITEMS[key].melee?.breaksAfter
		)!;
		expect(stackCondition(newStack(lasting))).toBeNull();
	});
});
