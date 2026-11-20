import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GEAR_SLOTS, type Inventory } from '../player/types.ts';
import { addTestItems, removeTestItems } from '../testing/items.ts';
import {
	accepts,
	addItem,
	allStacks,
	cloneInventory,
	emptyInventory,
	equip,
	getSlot,
	moveStack,
	newStack,
	quickMove,
	sanitizeInventory,
	type Belongings
} from './inventory.ts';

/** The gear slots (three) and materials (backpack and stash only). See docs/dev/items.md. */

beforeAll(() => addTestItems());
afterAll(() => removeTestItems());

describe('the gear slots', () => {
	it('hold three things, and only gear', () => {
		expect(GEAR_SLOTS).toHaveLength(3);
		for (const slot of GEAR_SLOTS) {
			expect(accepts({ area: 'equipment', slot }, 'test.kneepads')).toBe(true);
			expect(accepts({ area: 'equipment', slot }, 'knife')).toBe(false);
			expect(accepts({ area: 'equipment', slot }, 'coat')).toBe(false);
		}
		expect(accepts({ area: 'equipment', slot: 'primary' }, 'test.kneepads')).toBe(false);
		expect(accepts({ area: 'quick', index: 0 }, 'test.kneepads')).toBe(false);
		expect(accepts({ area: 'backpack', index: 0 }, 'test.kneepads')).toBe(true);
	});

	it('gear picked up goes into a free gear slot, then the backpack', () => {
		const inv = emptyInventory();
		for (let i = 0; i < 4; i++) expect(addItem(inv, newStack('test.kneepads'))).toBe(0);
		for (const slot of GEAR_SLOTS) expect(inv.equipment[slot]?.item).toBe('test.kneepads');
		expect(inv.backpack[0]?.item).toBe('test.kneepads');
	});

	it('equip and shift-click move gear between the stash and the gear slots', () => {
		const b: Belongings = { inventory: emptyInventory(), stash: [newStack('test.kneepads'), null] };
		expect(equip(b, { area: 'stash', index: 0 })).toBe('ok');
		expect(b.inventory.equipment.gear1?.item).toBe('test.kneepads');
		expect(quickMove(b, { area: 'equipment', slot: 'gear1' })).toBe('ok');
		expect(b.inventory.equipment.gear1).toBeNull();
		expect(b.stash?.[0]?.item).toBe('test.kneepads');
	});

	it('a loadout saved before the gear slots existed still works', () => {
		const old = emptyInventory() as Partial<Inventory> & Inventory;
		const equipment = old.equipment as Partial<Inventory['equipment']>;
		for (const slot of GEAR_SLOTS) delete equipment[slot];
		old.equipment.primary = newStack('knife');
		expect(getSlot({ inventory: old }, { area: 'equipment', slot: 'gear2' })).toBeNull();
		expect(allStacks(old).map((s) => s.item)).toEqual(['knife']);
		expect(cloneInventory(old).equipment.gear3).toBeNull();
		expect(sanitizeInventory(JSON.parse(JSON.stringify(old)))?.equipment.gear1).toBeNull();
		// Something can go in one all the same.
		const b: Belongings = { inventory: old, stash: [newStack('test.kneepads')] };
		expect(moveStack(b, { area: 'stash', index: 0 }, { area: 'equipment', slot: 'gear2' })).toBe(
			'ok'
		);
		expect(old.equipment.gear2?.item).toBe('test.kneepads');
	});

	it("a guest's kit keeps its gear, and only gear, in the gear slots", () => {
		const raw = JSON.parse(JSON.stringify(emptyInventory()));
		raw.equipment.gear1 = newStack('test.kneepads');
		raw.equipment.gear2 = newStack('knife');
		const inv = sanitizeInventory(raw)!;
		expect(inv.equipment.gear1?.item).toBe('test.kneepads');
		expect(inv.equipment.gear2).toBeNull();
	});
});

describe('materials', () => {
	it('go in the backpack and the stash, never a quick-use or equipment slot', () => {
		expect(accepts({ area: 'backpack', index: 0 }, 'test.rags')).toBe(true);
		expect(accepts({ area: 'stash', index: 0 }, 'test.rags')).toBe(true);
		expect(accepts({ area: 'quick', index: 0 }, 'test.rags')).toBe(false);
		expect(accepts({ area: 'equipment', slot: 'gear1' }, 'test.rags')).toBe(false);
	});

	it('stack, and are picked up into the backpack', () => {
		const inv = emptyInventory();
		expect(addItem(inv, newStack('test.rags', 14))).toBe(0);
		expect(inv.backpack[0]).toEqual({ item: 'test.rags', count: 10 });
		expect(inv.backpack[1]).toEqual({ item: 'test.rags', count: 4 });
		expect(inv.quick.every((slot) => slot === null)).toBe(true);
	});

	it('equipping one has nowhere to go', () => {
		const b: Belongings = { inventory: emptyInventory(), stash: [newStack('test.rags', 3)] };
		expect(equip(b, { area: 'stash', index: 0 })).toBe('refused');
	});
});
