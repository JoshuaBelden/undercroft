import { BACKPACKS, CARRY, DEFAULT_BACKPACK } from '../../content/carry.ts';
import { HOTBAR_SLOTS, ITEMS } from '../../content/items.ts';
import type { Inventory, ItemStack } from '../player/types.ts';
import type { InventoryAction, ItemRef } from './types.ts';

/**
 * Inventory helpers shared by the server (pickups, drops, the inventory screen's requests,
 * admin), the simulation (spending ammo and bandages, the weight of the load) and the client
 * (prompts, the inventory screen).
 *
 * Three places: quick slots (the hotbar, one held item each), the pack (everything else, limited
 * by bulk) and pockets (counted small things). All of it weighs something.
 * See docs/dev/items.md.
 */

/** Carrying nothing. */
export function emptyInventory(): Inventory {
	return {
		hotbar: new Array<ItemStack | null>(HOTBAR_SLOTS).fill(null),
		selected: 0,
		pockets: {},
		pack: [],
		backpack: DEFAULT_BACKPACK
	};
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
		pockets: { ...inv.pockets },
		pack: inv.pack.map((s) => ({ ...s })),
		backpack: inv.backpack
	};
}

export function held(inv: Inventory): ItemStack | null {
	return inv.hotbar[inv.selected] ?? null;
}

export function pocketCount(inv: Inventory, item: string): number {
	return inv.pockets[item] ?? 0;
}

/** How many of an item are carried anywhere: quick slots, pack and pockets. */
export function carriedCount(inv: Inventory, item: string): number {
	let count = pocketCount(inv, item);
	for (const stack of inv.hotbar) if (stack?.item === item) count += stack.count;
	for (const stack of inv.pack) if (stack.item === item) count += stack.count;
	return count;
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

/** Weight (kg) of everything carried. */
export function carriedWeight(inv: Inventory): number {
	let weight = 0;
	for (const stack of inv.hotbar) if (stack) weight += stackWeight(stack);
	for (const stack of inv.pack) weight += stackWeight(stack);
	for (const [item, count] of Object.entries(inv.pockets)) {
		weight += (ITEMS[item]?.weight ?? 0) * count;
	}
	return weight;
}

/** What the loot carried would sell for. */
export function lootValue(inv: Inventory): number {
	let value = 0;
	for (const stack of allStacks(inv)) value += (ITEMS[stack.item]?.value ?? 0) * stack.count;
	return value;
}

/** Bulk units used in the pack. */
export function packBulk(inv: Inventory): number {
	let bulk = 0;
	for (const stack of inv.pack) bulk += stackBulk(stack);
	return bulk;
}

export function packCapacity(inv: Inventory): number {
	return (BACKPACKS[inv.backpack] ?? BACKPACKS[DEFAULT_BACKPACK]).capacity;
}

/** How loaded down the player is: 0 up to the comfortable weight, 1 at the maximum. */
export function loadFactor(inv: Inventory): number {
	const over = carriedWeight(inv) - CARRY.comfortable;
	return Math.max(0, Math.min(1, over / (CARRY.max - CARRY.comfortable)));
}

/** Movement speed multiplier from the weight carried. */
export function speedFactor(inv: Inventory): number {
	return 1 - loadFactor(inv) * (1 - CARRY.slowest);
}

/** Whether at least one of a stack could be picked up, or why not. */
export function canTake(inv: Inventory, stack: ItemStack): 'ok' | 'heavy' | 'full' {
	const def = ITEMS[stack.item];
	if (!def) return 'full';
	if (unitsByWeight(inv, def.weight) < 1) return 'heavy';
	if (def.pocket) return pocketCount(inv, stack.item) < def.stack ? 'ok' : 'full';
	if ((def.melee || def.firearm || def.throwable) && inv.hotbar.includes(null)) return 'ok';
	return packRoom(inv, stack) ? 'ok' : 'full';
}

/**
 * Add an item. Pocket items stack up to their limit. Things used in the hand take an empty quick
 * slot (the selected one first), and go in the pack when there is none; everything else goes
 * straight in the pack. Nothing is taken past the maximum
 * weight. Returns how many didn't fit.
 */
export function addItem(inv: Inventory, stack: ItemStack): number {
	const def = ITEMS[stack.item];
	if (!def) return stack.count;
	if (def.pocket) {
		const have = pocketCount(inv, stack.item);
		const room = Math.max(0, def.stack - have);
		const added = Math.min(room, stack.count, unitsByWeight(inv, def.weight));
		if (added > 0) inv.pockets[stack.item] = have + added;
		return stack.count - added;
	}
	let left = stack.count;
	// Only things you can use in the hand take a quick slot; the rest (loot) goes in the pack.
	const handy = !!(def.melee || def.firearm || def.throwable);
	while (left > 0 && unitsByWeight(inv, def.weight) >= 1) {
		const one = { ...stack, count: 1 };
		const order = [inv.selected, ...inv.hotbar.keys()];
		const slot = handy ? order.find((i) => inv.hotbar[i] === null) : undefined;
		if (slot !== undefined) inv.hotbar[slot] = one;
		else if (packRoom(inv, one)) stow(inv, one);
		else break;
		left--;
	}
	return left;
}

/**
 * Move something between a quick slot and the pack, or between two quick slots (they swap).
 * A pack item sent to an occupied quick slot swaps with what was there. Returns whether
 * anything moved.
 */
export function moveItem(inv: Inventory, from: ItemRef, to: ItemRef): boolean {
	if (from.area === 'hotbar' && to.area === 'hotbar') {
		const a = inv.hotbar[from.index];
		if (!a || from.index === to.index || !(to.index in inv.hotbar)) return false;
		inv.hotbar[from.index] = inv.hotbar[to.index];
		inv.hotbar[to.index] = a;
		return true;
	}
	if (from.area === 'hotbar' && to.area === 'pack') {
		const stack = inv.hotbar[from.index];
		if (!stack || !packRoom(inv, stack)) return false;
		inv.hotbar[from.index] = null;
		stow(inv, stack);
		return true;
	}
	if (from.area === 'pack' && to.area === 'hotbar') {
		const stack = inv.pack[from.index];
		if (!stack || !(to.index in inv.hotbar)) return false;
		const one = { ...stack, count: 1 };
		const displaced = inv.hotbar[to.index];
		if (displaced) {
			// What comes out of the slot has to fit in the room the other leaves.
			const after = packBulk(inv) - stackBulk(one) + stackBulk(displaced);
			if (after > packCapacity(inv) + 1e-9) return false;
		}
		if (stack.count > 1) stack.count--;
		else inv.pack.splice(from.index, 1);
		inv.hotbar[to.index] = one;
		if (displaced) stow(inv, displaced);
		return true;
	}
	return false;
}

/** Take up to `count` of something out of the inventory (to drop it). Null if it isn't there. */
export function takeStack(inv: Inventory, from: ItemRef, count: number): ItemStack | null {
	const want = Math.max(1, Math.floor(count));
	if (from.area === 'hotbar') {
		const stack = inv.hotbar[from.index];
		if (!stack) return null;
		inv.hotbar[from.index] = null;
		return stack;
	}
	if (from.area === 'pack') {
		const stack = inv.pack[from.index];
		if (!stack) return null;
		const taken = Math.min(want, stack.count);
		if (taken >= stack.count) inv.pack.splice(from.index, 1);
		else stack.count -= taken;
		return { ...stack, count: taken };
	}
	const taken = takePocket(inv, from.item, want);
	return taken > 0 ? { item: from.item, count: taken } : null;
}

/** Remove up to `count` of an item from wherever it is carried; returns how many were removed. */
export function removeItem(inv: Inventory, item: string, count: number): number {
	let left = count - takePocket(inv, item, count);
	for (let i = inv.pack.length - 1; i >= 0 && left > 0; i--) {
		const stack = inv.pack[i];
		if (stack.item !== item) continue;
		const taken = Math.min(stack.count, left);
		left -= taken;
		if (taken >= stack.count) inv.pack.splice(i, 1);
		else stack.count -= taken;
	}
	for (let i = 0; i < inv.hotbar.length && left > 0; i++) {
		if (inv.hotbar[i]?.item !== item) continue;
		inv.hotbar[i] = null;
		left--;
	}
	return count - left;
}

/** Everything carried, as stacks (for dropping on death). */
export function allStacks(inv: Inventory): ItemStack[] {
	const stacks = inv.hotbar.filter((s): s is ItemStack => s !== null).map((s) => ({ ...s }));
	for (const stack of inv.pack) stacks.push({ ...stack });
	for (const [item, count] of Object.entries(inv.pockets)) {
		if (count > 0) stacks.push({ item, count });
	}
	return stacks;
}

/** Check an untrusted inventory request (from the network). */
export function sanitizeAction(raw: unknown): InventoryAction | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const a = raw as Record<string, unknown>;
	const from = sanitizeRef(a.from);
	if (!from) return null;
	if (a.kind === 'move') {
		const to = sanitizeRef(a.to);
		return to && from.area !== 'pocket' && to.area !== 'pocket' ? { kind: 'move', from, to } : null;
	}
	if (a.kind === 'drop') {
		const count = typeof a.count === 'number' && Number.isFinite(a.count) ? a.count : 1;
		return { kind: 'drop', from, count: Math.max(1, Math.min(999, Math.floor(count))) };
	}
	return null;
}

function sanitizeRef(raw: unknown): ItemRef | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (r.area === 'pocket')
		return typeof r.item === 'string' ? { area: 'pocket', item: r.item } : null;
	if (r.area !== 'hotbar' && r.area !== 'pack') return null;
	if (typeof r.index !== 'number' || !Number.isInteger(r.index) || r.index < 0) return null;
	return { area: r.area, index: r.index };
}

function stackWeight(stack: ItemStack): number {
	return (ITEMS[stack.item]?.weight ?? 0) * stack.count;
}

function stackBulk(stack: ItemStack): number {
	return (ITEMS[stack.item]?.bulk ?? 0) * stack.count;
}

/** How many of something this heavy can still be carried. */
function unitsByWeight(inv: Inventory, weight: number): number {
	if (weight <= 0) return Infinity;
	return Math.floor((CARRY.max - carriedWeight(inv) + 1e-9) / weight);
}

/** Items with their own state (rounds loaded, wear) never share a pack entry. */
function stackable(stack: ItemStack): boolean {
	return (
		(ITEMS[stack.item]?.stack ?? 1) > 1 && stack.loaded === undefined && stack.uses === undefined
	);
}

function packRoom(inv: Inventory, stack: ItemStack): boolean {
	return packBulk(inv) + stackBulk(stack) <= packCapacity(inv) + 1e-9;
}

/** Put a stack in the pack, joining an entry of the same item where it can. */
function stow(inv: Inventory, stack: ItemStack): void {
	const limit = ITEMS[stack.item]?.stack ?? 1;
	let left = stack.count;
	if (stackable(stack)) {
		for (const entry of inv.pack) {
			if (left <= 0) break;
			if (entry.item !== stack.item || !stackable(entry)) continue;
			const added = Math.min(limit - entry.count, left);
			if (added <= 0) continue;
			entry.count += added;
			left -= added;
		}
	}
	if (left > 0) inv.pack.push({ ...stack, count: left });
}
