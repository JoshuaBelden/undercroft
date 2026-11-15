import { describe, expect, it } from 'vitest';
import { ITEMS } from '../content/items.ts';
import { CRATES } from '../content/loot.ts';
import { applyAction, emptyInventory, maxStack, newStack } from '../shared/items/inventory.ts';
import type { CrateSlot } from '../shared/items/types.ts';
import type { Inventory } from '../shared/player/types.ts';
import { CrateFocus, nextStop } from './crateFocus.ts';

/** Items by what they are, not by name (as in inventory.test.ts). */
function itemWhere(test: (id: string) => boolean): string {
	const id = Object.keys(ITEMS).find(test);
	if (!id) throw new Error('no item in ITEMS fits this test');
	return id;
}
/** Loot that stacks to many: it only goes in the pack. */
const LOOT = itemWhere((id) => ITEMS[id].kind === 'loot' && ITEMS[id].maxStack >= 10);
const OTHER_LOOT = itemWhere((id) => ITEMS[id].kind === 'loot' && id !== LOOT);

/** A crate's slots as the client is told them: `'hidden'` is still sealed, null is empty. */
function crate(...slots: CrateSlot[]): CrateSlot[] {
	return [...slots, ...new Array<CrateSlot>(CRATES.slots - slots.length).fill(null)];
}

/** A pack with every backpack slot taken by something else. */
function fullPack(): Inventory {
	const inventory = emptyInventory();
	inventory.backpack = inventory.backpack.map(() => newStack(OTHER_LOOT));
	return inventory;
}

/** The server's answer to X on crate slot `index`, by the real rules: the crate's slots after. */
function answer(inventory: Inventory, slots: CrateSlot[], index: number): CrateSlot[] {
	const sealed = new Set(slots.flatMap((slot, i) => (slot === 'hidden' ? [i] : [])));
	const stash = slots.map((slot) => (slot && slot !== 'hidden' ? { ...slot } : null));
	applyAction({ inventory, stash, sealed }, { kind: 'quick', from: { area: 'stash', index } });
	return stash.map((slot, i) => (sealed.has(i) ? 'hidden' : slot));
}

/** X on crate slot `index`, and the server's answer to it. */
function pressX(focus: CrateFocus, inventory: Inventory, slots: CrateSlot[], index: number) {
	focus.press(slots, index, true);
	return answer(inventory, slots, index);
}

describe('the next stop in a crate', () => {
	it('is the next slot to the right, then the start of the next row', () => {
		const slots = crate(...new Array<CrateSlot>(CRATES.slots).fill(newStack(LOOT)));
		expect(nextStop(slots, 0)).toBe(1);
		expect(nextStop(slots, CRATES.columns - 1)).toBe(CRATES.columns);
	});

	it('skips empty slots and stops on a sealed one', () => {
		const slots = crate(newStack(LOOT), null, null, 'hidden', newStack(LOOT));
		expect(nextStop(slots, 0)).toBe(3);
		expect(nextStop(slots, 3)).toBe(4);
	});

	it('is nowhere after the last thing in the crate: no wrapping back to the top', () => {
		const slots = crate(newStack(LOOT), newStack(LOOT));
		expect(nextStop(slots, 1)).toBeNull();
		expect(nextStop(slots, CRATES.slots - 1)).toBeNull();
	});
});

describe('the focus after X in a crate', () => {
	it('moves on once the item has gone into the pack', () => {
		const focus = new CrateFocus();
		const slots = crate(newStack(LOOT, 3), null, newStack(OTHER_LOOT));
		const after = pressX(focus, emptyInventory(), slots, 0);
		expect(after[0]).toBeNull();
		expect(focus.update(after)).toEqual({ from: 0, to: 2 });
		// Answered: the next update has nothing more to say.
		expect(focus.update(after)).toBeNull();
	});

	it('waits for the server: nothing until the slot changes', () => {
		const focus = new CrateFocus();
		const slots = crate(newStack(LOOT), newStack(LOOT));
		const after = pressX(focus, emptyInventory(), slots, 0);
		// The crate as it was, sent before the server had the press.
		expect(focus.update(crate(newStack(LOOT), newStack(LOOT)))).toBeNull();
		expect(focus.update(after)).toEqual({ from: 0, to: 1 });
	});

	it('moves on to a slot still being searched', () => {
		const focus = new CrateFocus();
		const after = pressX(focus, emptyInventory(), crate(newStack(LOOT), 'hidden', 'hidden'), 0);
		expect(focus.update(after)).toEqual({ from: 0, to: 1 });
	});

	it('stays put on the last thing in the crate', () => {
		const focus = new CrateFocus();
		const after = pressX(focus, emptyInventory(), crate(null, newStack(LOOT)), 1);
		expect(after[1]).toBeNull();
		expect(focus.update(after)).toBeNull();
	});

	it('stays put when the pack is full, and forgets the X at the next press', () => {
		const focus = new CrateFocus();
		const slots = crate(newStack(LOOT), newStack(LOOT));
		const after = pressX(focus, fullPack(), slots, 0);
		expect(after).toEqual(slots);
		expect(focus.update(after)).toBeNull();
		// Something else (A here) took it out after all: that isn't X sending it.
		focus.press(after, 0, false);
		expect(focus.update(crate(null, newStack(LOOT)))).toBeNull();
	});

	it('stays put when only part of a stack fits, and forgets the X', () => {
		const focus = new CrateFocus();
		const inventory = fullPack();
		inventory.backpack[0] = newStack(LOOT, maxStack(LOOT) - 2);
		const after = pressX(focus, inventory, crate(newStack(LOOT, 5), newStack(LOOT)), 0);
		expect(after[0]).toEqual(newStack(LOOT, 3));
		expect(focus.update(after)).toBeNull();
		expect(focus.update(crate(null, newStack(LOOT)))).toBeNull();
	});

	it('forgets an X still waiting when another button is pressed', () => {
		const focus = new CrateFocus();
		const slots = crate(newStack(LOOT), newStack(LOOT));
		const after = pressX(focus, emptyInventory(), slots, 0);
		// Y on the same slot, or any press away from the crate's slots.
		focus.press(slots, 0, false);
		expect(focus.update(after)).toBeNull();
		focus.press(slots, 0, true);
		focus.press(slots, -1, false);
		expect(focus.update(after)).toBeNull();
	});

	it('ignores X where nothing was sent: an empty or sealed slot', () => {
		const focus = new CrateFocus();
		const slots = crate(null, 'hidden', newStack(LOOT));
		focus.press(slots, 0, true);
		expect(focus.update(crate(null, 'hidden', null))).toBeNull();
		focus.press(slots, 1, true);
		expect(focus.update(crate(null, newStack(LOOT), newStack(LOOT)))).toBeNull();
	});
});
