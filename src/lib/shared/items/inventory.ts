import { HOTBAR_SLOTS, ITEMS } from '../../content/items.ts';
import { STARTING_LOADOUT } from '../../content/loadout.ts';
import type { Inventory, ItemStack } from '../player/types.ts';

/**
 * Inventory helpers shared by the server (pickups, drops, admin) and the simulation (spending
 * ammo and bandages). Hotbar items are held; pocket items are only counted.
 * See docs/dev/items.md.
 */

export function startingInventory(): Inventory {
	const hotbar: (ItemStack | null)[] = new Array(HOTBAR_SLOTS).fill(null);
	STARTING_LOADOUT.hotbar.forEach((entry, i) => {
		if (i < HOTBAR_SLOTS && ITEMS[entry.item]) hotbar[i] = newStack(entry.item, 1, entry.loaded);
	});
	return { hotbar, selected: 0, pockets: { ...STARTING_LOADOUT.pockets } };
}

export function newStack(item: string, count = 1, loaded?: number): ItemStack {
	const stack: ItemStack = { item, count };
	const def = ITEMS[item];
	if (def?.firearm) stack.loaded = Math.min(def.firearm.magazine, loaded ?? 0);
	if (def?.melee?.breaksAfter) stack.uses = 0;
	return stack;
}

export function cloneInventory(inv: Inventory): Inventory {
	return {
		hotbar: inv.hotbar.map((s) => (s ? { ...s } : null)),
		selected: inv.selected,
		pockets: { ...inv.pockets }
	};
}

export function held(inv: Inventory): ItemStack | null {
	return inv.hotbar[inv.selected] ?? null;
}

export function pocketCount(inv: Inventory, item: string): number {
	return inv.pockets[item] ?? 0;
}

/** Take up to `count` from a pocket; returns how many were taken. */
export function takePocket(inv: Inventory, item: string, count: number): number {
	const have = pocketCount(inv, item);
	const taken = Math.min(have, count);
	if (taken <= 0) return 0;
	if (have - taken > 0) inv.pockets[item] = have - taken;
	else delete inv.pockets[item];
	return taken;
}

/**
 * Add an item. Pocket items stack up to their limit; held items need an empty hotbar slot
 * (the selected one first). Returns how many didn't fit.
 */
export function addItem(inv: Inventory, stack: ItemStack): number {
	const def = ITEMS[stack.item];
	if (!def) return stack.count;
	if (def.pocket) {
		const have = pocketCount(inv, stack.item);
		const room = Math.max(0, def.stack - have);
		const added = Math.min(room, stack.count);
		if (added > 0) inv.pockets[stack.item] = have + added;
		return stack.count - added;
	}
	const order = [inv.selected, ...inv.hotbar.keys()];
	const slot = order.find((i) => inv.hotbar[i] === null);
	if (slot === undefined) return stack.count;
	inv.hotbar[slot] = { ...stack, count: 1 };
	return stack.count - 1;
}

/** Everything carried, as stacks (for dropping on death). */
export function allStacks(inv: Inventory): ItemStack[] {
	const stacks = inv.hotbar.filter((s): s is ItemStack => s !== null).map((s) => ({ ...s }));
	for (const [item, count] of Object.entries(inv.pockets)) {
		if (count > 0) stacks.push({ item, count });
	}
	return stacks;
}
