import { describe, expect, it } from 'vitest';
import { ITEMS } from '#lib/content/items.ts';
import { newStack } from '#lib/shared/items/inventory.ts';
import { stackCondition } from './items.ts';

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
