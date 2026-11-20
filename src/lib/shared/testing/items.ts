import { ITEMS, type ItemDef } from '../../content/items.ts';

/**
 * Items for tests, for kinds of thing the game has no item of yet (gear, materials): put them in
 * `ITEMS` for a test file, and take them out again after. See docs/dev/testing.md.
 *
 *   beforeAll(() => addTestItems());
 *   afterAll(() => removeTestItems());
 */

const HOLD: ItemDef['hold'] = { offset: [0, 0, 0], scale: 1 };

export const TEST_ITEMS: Record<string, ItemDef> = {
	'test.kneepads': {
		id: 'test.kneepads',
		name: 'Test kneepads',
		kind: 'gear',
		category: 'gear',
		flavor: 'Worn in a gear slot.',
		model: null,
		hold: HOLD,
		maxStack: 1,
		weight: 0.4,
		price: 40,
		durability: { max: 600, per: 'second' }
	},
	'test.rags': {
		id: 'test.rags',
		name: 'Test rags',
		kind: 'material',
		category: 'material',
		flavor: 'A material: backpack and stash only.',
		model: null,
		hold: HOLD,
		maxStack: 10,
		weight: 0.05,
		value: 1
	}
};

export function addTestItems(): void {
	Object.assign(ITEMS, TEST_ITEMS);
}

export function removeTestItems(): void {
	for (const id of Object.keys(TEST_ITEMS)) delete ITEMS[id];
}
