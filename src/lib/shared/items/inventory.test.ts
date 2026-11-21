import { describe, expect, it } from 'vitest';
import { CARRY } from '../../content/carry.ts';
import { ITEMS, type ItemCategory } from '../../content/items.ts';
import { HAND } from '../player/types.ts';
import {
	addItem,
	addItemAt,
	addToSlots,
	allStacks,
	applyAction,
	canTake,
	carriedCount,
	carriedWeight,
	sanitizeInventory,
	cloneInventory,
	emptyInventory,
	emptySlots,
	equip,
	held,
	maxStack,
	moveStack,
	newStack,
	removeItem,
	sanitizeAction,
	sanitizeRef,
	speedFactor,
	spendHeld,
	splitStack,
	type Belongings
} from './inventory.ts';

/**
 * Items are picked from the real content by what they are, not by name, so the tests survive
 * new and renamed items.
 */
function itemWhere(test: (id: string) => boolean): string {
	const id = Object.keys(ITEMS).find(test);
	if (!id) throw new Error('no item in ITEMS fits this test');
	return id;
}
const of = (category: ItemCategory) => (id: string) =>
	ITEMS[id].category === category && ITEMS[id].maxStack >= 1;

/** Stacks to many, light, only goes in the pack. */
const JUNK = itemWhere((id) => of('other')(id) && ITEMS[id].maxStack >= 10 && ITEMS[id].weight > 0);
const WEAPON = itemWhere(of('weapon'));
const OTHER_WEAPON = itemWhere((id) => of('weapon')(id) && id !== WEAPON);
const QUICK = itemWhere((id) => of('quick')(id) && ITEMS[id].maxStack > 1);
/** Heavy enough that a full load of it fits in the slots (so weight, not room, is the limit). */
const HEAVY = itemWhere((id) => ITEMS[id].maxStack >= 1 && ITEMS[id].weight >= 2);
/** How many HEAVY make a full load. */
const FULL_LOAD = Math.floor(CARRY.max / ITEMS[HEAVY].weight);

const total = (b: Belongings, item: string) =>
	carriedCount(b.inventory, item) +
	(b.stash ?? []).reduce((n, s) => n + (s?.item === item ? s.count : 0), 0);

describe('adding and removing', () => {
	it('stacks up to maxStack, then fills more slots', () => {
		const inv = emptyInventory();
		const n = maxStack(JUNK) + 3;
		expect(addItem(inv, newStack(JUNK, n))).toBe(0);
		expect(carriedCount(inv, JUNK)).toBe(n);
		const slots = inv.backpack.filter((s) => s?.item === JUNK);
		expect(slots.map((s) => s!.count)).toEqual([maxStack(JUNK), 3]);
	});

	it('puts a weapon in a weapon slot and a quick item in a quick slot', () => {
		const inv = emptyInventory();
		addItem(inv, newStack(WEAPON));
		addItem(inv, newStack(QUICK, 2));
		expect(inv.equipment.primary?.item).toBe(WEAPON);
		expect(inv.quick[0]?.item).toBe(QUICK);
		expect(inv.backpack.every((s) => s === null)).toBe(true);
	});

	it('refuses anything that would go past the maximum weight', () => {
		const inv = emptyInventory();
		expect(addItem(inv, newStack(HEAVY, FULL_LOAD + 5))).toBe(5);
		expect(carriedCount(inv, HEAVY)).toBe(FULL_LOAD);
		expect(carriedWeight(inv)).toBeLessThanOrEqual(CARRY.max + 1e-9);
		expect(canTake(inv, newStack(HEAVY))).toBe('heavy');
		expect(canTake(emptyInventory(), newStack(HEAVY))).toBe('ok');
	});

	it('removeItem takes from wherever it is and reports how many', () => {
		const inv = emptyInventory();
		addItem(inv, newStack(JUNK, 7));
		expect(removeItem(inv, JUNK, 5)).toBe(5);
		expect(carriedCount(inv, JUNK)).toBe(2);
		expect(removeItem(inv, JUNK, 10)).toBe(2);
		expect(carriedCount(inv, JUNK)).toBe(0);
	});

	it('removeItem puts the hand back on the primary when its quick slot empties', () => {
		const inv = emptyInventory();
		addItem(inv, newStack(QUICK, 1));
		inv.selected = HAND.quick;
		removeItem(inv, QUICK, 1);
		expect(inv.selected).toBe(HAND.primary);
	});

	it('unknown items never go in', () => {
		const inv = emptyInventory();
		expect(addItem(inv, { item: 'no-such-item', count: 3 })).toBe(3);
		expect(canTake(inv, { item: 'no-such-item', count: 1 })).toBe('full');
		expect(addToSlots(emptySlots(4), { item: 'no-such-item', count: 2 })).toBe(2);
	});
});

describe('adding into one slot (the admin catalogue)', () => {
	const pack = (index: number) => ({ area: 'backpack', index }) as const;

	it('puts it in that slot, stacking onto the same item, up to maxStack', () => {
		const inv = emptyInventory();
		expect(addItemAt(inv, pack(5), newStack(JUNK, 3))).toBe(0);
		expect(addItemAt(inv, pack(5), newStack(JUNK, maxStack(JUNK)))).toBe(3);
		expect(inv.backpack[5]).toMatchObject({ item: JUNK, count: maxStack(JUNK) });
		expect(carriedCount(inv, JUNK)).toBe(maxStack(JUNK));
	});

	it("moves what was there into the backpack, or refuses if it can't", () => {
		const inv = emptyInventory();
		addItem(inv, newStack(WEAPON));
		const primary = { area: 'equipment', slot: 'primary' } as const;
		expect(addItemAt(inv, primary, newStack(OTHER_WEAPON))).toBe(0);
		expect(inv.equipment.primary?.item).toBe(OTHER_WEAPON);
		expect(inv.backpack.some((s) => s?.item === WEAPON)).toBe(true);
		// With the backpack full, the weapon in the slot stays and the new one isn't given.
		const full = emptyInventory();
		full.equipment.primary = newStack(WEAPON);
		full.backpack.fill(newStack(JUNK));
		expect(addItemAt(full, primary, newStack(OTHER_WEAPON))).toBe(1);
		expect(full.equipment.primary?.item).toBe(WEAPON);
	});

	it("refuses a slot that doesn't take it, the stash, or past the maximum weight", () => {
		const inv = emptyInventory();
		expect(addItemAt(inv, { area: 'quick', index: 0 }, newStack(JUNK, 2))).toBe(2);
		expect(addItemAt(inv, { area: 'stash', index: 0 }, newStack(JUNK, 2))).toBe(2);
		expect(addItemAt(inv, pack(99), newStack(JUNK, 2))).toBe(2);
		addItem(inv, newStack(HEAVY, FULL_LOAD));
		const free = inv.backpack.findIndex((s) => !s);
		expect(addItemAt(inv, pack(free), newStack(HEAVY))).toBe(1);
	});
});

describe('weight', () => {
	it('slows you only past the comfortable weight', () => {
		const inv = emptyInventory();
		expect(speedFactor(inv)).toBe(1);
		addItem(inv, newStack(HEAVY, FULL_LOAD));
		expect(speedFactor(inv)).toBeLessThan(1);
		expect(speedFactor(inv)).toBeGreaterThanOrEqual(CARRY.slowest - 1e-9);
	});
});

describe('moving between slots', () => {
	it('conserves counts when moving part of a stack', () => {
		const b: Belongings = { inventory: emptyInventory() };
		addItem(b.inventory, newStack(JUNK, 6));
		const from = { area: 'backpack', index: 0 } as const;
		expect(moveStack(b, from, { area: 'backpack', index: 5 }, 2)).toBe('ok');
		expect(b.inventory.backpack[0]?.count).toBe(4);
		expect(b.inventory.backpack[5]?.count).toBe(2);
		expect(total(b, JUNK)).toBe(6);
	});

	it('swaps two different weapons', () => {
		const b: Belongings = { inventory: emptyInventory() };
		addItem(b.inventory, newStack(WEAPON));
		addItem(b.inventory, newStack(OTHER_WEAPON));
		expect(
			moveStack(b, { area: 'equipment', slot: 'primary' }, { area: 'equipment', slot: 'secondary' })
		).toBe('ok');
		expect(b.inventory.equipment.primary?.item).toBe(OTHER_WEAPON);
		expect(b.inventory.equipment.secondary?.item).toBe(WEAPON);
	});

	it('refuses things in slots that do not take them', () => {
		const b: Belongings = { inventory: emptyInventory() };
		addItem(b.inventory, newStack(JUNK, 2));
		const from = { area: 'backpack', index: 0 } as const;
		expect(moveStack(b, from, { area: 'equipment', slot: 'primary' })).toBe('refused');
		expect(moveStack(b, from, { area: 'quick', index: 0 })).toBe('refused');
		expect(moveStack(b, from, from)).toBe('refused');
		expect(moveStack(b, from, { area: 'backpack', index: 999 })).toBe('refused');
	});

	it('never touches sealed crate slots', () => {
		const stash = emptySlots(4);
		stash[1] = newStack(JUNK, 3);
		const b: Belongings = { inventory: emptyInventory(), stash, sealed: new Set([1]) };
		expect(moveStack(b, { area: 'stash', index: 1 }, { area: 'backpack', index: 0 })).toBe(
			'refused'
		);
		expect(carriedCount(b.inventory, JUNK)).toBe(0);
	});

	it('taking from the stash stops at the maximum weight', () => {
		const stash = emptySlots(4);
		stash[0] = newStack(HEAVY);
		const b: Belongings = { inventory: emptyInventory(), stash };
		addItem(b.inventory, newStack(HEAVY, FULL_LOAD));
		const to = { area: 'backpack', index: b.inventory.backpack.length - 1 } as const;
		expect(b.inventory.backpack[to.index]).toBeNull();
		expect(moveStack(b, { area: 'stash', index: 0 }, to)).toBe('heavy');
		expect(stash[0]?.count).toBe(1);
	});

	it('equip moves a weapon from the backpack into a weapon slot', () => {
		const b: Belongings = { inventory: emptyInventory() };
		b.inventory.backpack[3] = newStack(WEAPON);
		expect(equip(b, { area: 'backpack', index: 3 })).toBe('ok');
		expect(b.inventory.equipment.primary?.item).toBe(WEAPON);
		expect(b.inventory.backpack[3]).toBeNull();
	});

	it('splitStack conserves counts and refuses a whole-stack split', () => {
		const b: Belongings = { inventory: emptyInventory() };
		addItem(b.inventory, newStack(JUNK, 5));
		const from = { area: 'backpack', index: 0 } as const;
		expect(splitStack(b, from, 5)).toBe('refused');
		expect(splitStack(b, from, 2)).toBe('ok');
		expect(total(b, JUNK)).toBe(5);
		expect(b.inventory.backpack.filter(Boolean)).toHaveLength(2);
	});

	it('a drop hands back what came out', () => {
		const b: Belongings = { inventory: emptyInventory() };
		addItem(b.inventory, newStack(JUNK, 5));
		const out = applyAction(b, { kind: 'drop', from: { area: 'backpack', index: 0 }, count: 3 });
		expect(out.result).toBe('ok');
		expect(out.dropped).toMatchObject({ item: JUNK, count: 3 });
		expect(carriedCount(b.inventory, JUNK)).toBe(2);
	});
});

describe('the hand', () => {
	it('spendHeld uses one up, then empties the slot and returns to the primary', () => {
		const inv = emptyInventory();
		addItem(inv, newStack(QUICK, 2));
		inv.selected = HAND.quick;
		spendHeld(inv);
		expect(held(inv)?.count).toBe(1);
		spendHeld(inv);
		expect(held(inv)).toBeNull();
		expect(inv.selected).toBe(HAND.primary);
	});
});

describe('cloning', () => {
	it('cloneInventory is deep', () => {
		const inv = emptyInventory();
		addItem(inv, newStack(JUNK, 3));
		const copy = cloneInventory(inv);
		copy.backpack[0]!.count = 99;
		expect(inv.backpack[0]!.count).toBe(3);
		expect(allStacks(inv)).toEqual([{ item: JUNK, count: 3 }]);
	});
});

describe('untrusted requests', () => {
	it('sanitizeRef accepts real slots only', () => {
		expect(sanitizeRef({ area: 'backpack', index: 2 })).toEqual({ area: 'backpack', index: 2 });
		expect(sanitizeRef({ area: 'equipment', slot: 'defense' })).toEqual({
			area: 'equipment',
			slot: 'defense'
		});
		expect(sanitizeRef({ area: 'equipment', slot: 'hat' })).toBeNull();
		expect(sanitizeRef({ area: 'backpack', index: -1 })).toBeNull();
		expect(sanitizeRef({ area: 'backpack', index: 1.5 })).toBeNull();
		expect(sanitizeRef({ area: 'backpack', index: '1' })).toBeNull();
		expect(sanitizeRef(null)).toBeNull();
		expect(sanitizeRef('backpack')).toBeNull();
	});

	it('sanitizeRef only allows the stash when asked to', () => {
		expect(sanitizeRef({ area: 'stash', index: 0 })).toBeNull();
		expect(sanitizeRef({ area: 'stash', index: 0 }, true)).toEqual({ area: 'stash', index: 0 });
	});

	it('sanitizeAction clamps counts and rejects unknown kinds', () => {
		const from = { area: 'backpack', index: 0 };
		expect(sanitizeAction({ kind: 'drop', from, count: 1e9 })).toEqual({
			kind: 'drop',
			from,
			count: 999
		});
		expect(sanitizeAction({ kind: 'drop', from, count: Number.NaN })).toEqual({
			kind: 'drop',
			from,
			count: 1
		});
		expect(sanitizeAction({ kind: 'split', from })).toBeNull();
		expect(sanitizeAction({ kind: 'move', from })).toBeNull();
		expect(sanitizeAction({ kind: 'explode', from })).toBeNull();
		expect(sanitizeAction({ kind: 'quick', from: { area: 'stash', index: 0 } })).toBeNull();
	});
});

describe('an inventory from someone else (a co-op guest)', () => {
	it('keeps a well-formed one as it is', () => {
		const inv = emptyInventory();
		inv.equipment.primary = newStack('knife');
		inv.equipment.defense = newStack('coat');
		inv.backpack[3] = newStack('bandage', 2);
		inv.selected = HAND.secondary;
		expect(sanitizeInventory(JSON.parse(JSON.stringify(inv)))).toEqual(inv);
	});

	it('refuses the wrong shape', () => {
		for (const bad of [
			null,
			'kit',
			{},
			{ ...emptyInventory(), pack: 'bottomless' },
			{ ...emptyInventory(), backpack: 'x' }
		]) {
			expect(sanitizeInventory(bad)).toBeNull();
		}
	});

	it('leaves out what is unknown, too many, or in a slot that does not take it', () => {
		const raw = JSON.parse(JSON.stringify(emptyInventory()));
		raw.equipment.primary = { item: 'bandage', count: 1 };
		raw.equipment.secondary = { item: 'knife', count: 5 };
		raw.backpack[0] = { item: 'dragon', count: 1 };
		raw.backpack[1] = { item: 'bandage', count: 1, uses: -3 };
		raw.backpack.push(
			{ item: 'knife', count: 1 },
			{ item: 'knife', count: 1 },
			...Array(40).fill(null)
		);
		raw.quick[0] = { item: 'knife', count: 1 };
		raw.selected = 99;
		const inv = sanitizeInventory(raw)!;
		expect(inv.equipment).toEqual(emptyInventory().equipment);
		expect(inv.backpack).toHaveLength(emptyInventory().backpack.length);
		expect(inv.backpack[0]).toBeNull();
		expect(inv.backpack[1]).toEqual({ item: 'bandage', count: 1 });
		expect(inv.quick[0]).toBeNull();
		expect(inv.selected).toBe(HAND.primary);
	});
});
