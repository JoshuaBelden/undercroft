import { BACKPACKS, CARRY, DEFAULT_BACKPACK } from '../../content/carry.ts';
import { ITEMS, SLOTS, type ItemCategory, type ItemDef } from '../../content/items.ts';
import { HAND, type EquipmentSlot, type Inventory, type ItemStack } from '../player/types.ts';
import type { InventoryAction, SlotRef } from './types.ts';

/**
 * Inventory rules, shared by the game server (pickups, drops, the pack screen's requests, admin),
 * the simulation (what is in the hand, spending rounds, the weight of the load), the site (the
 * stash and the loadout) and the client (prompts, the inventory screens). Underground, an open
 * loot crate takes the stash's place.
 *
 * Everything is slots: two weapons and a defense slot (equipment), the backpack, the quick-use
 * slots and, on the surface, the stash. A slot holds one stack of up to the item's `maxStack`.
 * All of it weighs something. See docs/dev/items.md.
 */

/** A list of slots: the stash, the backpack, the quick-use slots. */
export type Slots = (ItemStack | null)[];

/** What a request can touch: an inventory and, on the surface, the stash beside it. */
export interface Belongings {
	inventory: Inventory;
	/** Underground, the slots of the loot crate that is open. */
	stash?: Slots;
	/** Stash slots that can't be touched: what is in a crate and hasn't been revealed yet. */
	sealed?: ReadonlySet<number>;
}

/** How a request went: done, refused for the weight, or refused (no room, not allowed there). */
export type MoveResult = 'ok' | 'heavy' | 'refused';

const EQUIPMENT: EquipmentSlot[] = ['primary', 'secondary', 'defense'];

export function emptySlots(count: number): Slots {
	return new Array<ItemStack | null>(count).fill(null);
}

/** Carrying nothing. */
export function emptyInventory(): Inventory {
	return {
		equipment: { primary: null, secondary: null, defense: null },
		backpack: emptySlots(BACKPACKS[DEFAULT_BACKPACK].slots),
		quick: emptySlots(SLOTS.quick),
		selected: HAND.primary,
		pack: DEFAULT_BACKPACK
	};
}

export function newStack(item: string, count = 1, loaded?: number): ItemStack {
	const stack: ItemStack = { item, count };
	const def = ITEMS[item];
	if (def?.firearm) stack.loaded = Math.min(def.firearm.magazine, loaded ?? 0);
	if (def?.melee?.breaksAfter || (def?.chalk?.marks ?? 1) > 1) stack.uses = 0;
	return stack;
}

export function cloneInventory(inv: Inventory): Inventory {
	const copy = (stack: ItemStack | null) => (stack ? { ...stack } : null);
	return {
		equipment: {
			primary: copy(inv.equipment.primary),
			secondary: copy(inv.equipment.secondary),
			defense: copy(inv.equipment.defense)
		},
		backpack: inv.backpack.map(copy),
		quick: inv.quick.map(copy),
		selected: inv.selected,
		pack: inv.pack
	};
}

/** How many of an item share a slot. */
export function maxStack(item: string): number {
	return ITEMS[item]?.maxStack ?? 0;
}

/** Which slot `Inventory.selected` (or an input frame's `select`) means, if it is one. */
export function handRef(inv: Inventory, selected: number): SlotRef | null {
	if (selected === HAND.primary) return { area: 'equipment', slot: 'primary' };
	if (selected === HAND.secondary) return { area: 'equipment', slot: 'secondary' };
	const index = selected - HAND.quick;
	return index >= 0 && index < inv.quick.length ? { area: 'quick', index } : null;
}

/** What is in the hand. */
export function held(inv: Inventory): ItemStack | null {
	const ref = handRef(inv, inv.selected);
	return ref ? getSlot({ inventory: inv }, ref) : null;
}

/**
 * One of what is in the hand is gone (thrown, used up); `all` empties the hand (dropped, broken).
 * When a quick-use slot runs out, the hand goes back to the primary weapon.
 */
export function spendHeld(inv: Inventory, all = false): void {
	const ref = handRef(inv, inv.selected);
	const stack = ref ? getSlot({ inventory: inv }, ref) : null;
	if (!ref || !stack) return;
	if (!all && stack.count > 1) {
		stack.count--;
		return;
	}
	setSlot({ inventory: inv }, ref, null);
	if (ref.area === 'quick') inv.selected = HAND.primary;
}

/**
 * A mark was drawn with the chalk in the hand: the stick in use wears, and is used up after its
 * `chalk.marks`. Returns false if there is no chalk in the hand.
 */
export function wearChalk(inv: Inventory): boolean {
	const stack = held(inv);
	const marks = stack ? ITEMS[stack.item]?.chalk?.marks : undefined;
	if (!stack || !marks) return false;
	const used = (stack.uses ?? 0) + 1;
	if (used < marks) {
		stack.uses = used;
		return true;
	}
	if (marks > 1) stack.uses = 0;
	spendHeld(inv);
	return true;
}

/** The first quick-use slot holding something with this ability, or -1. */
export function quickWith(inv: Inventory, ability: 'revive' | 'heal'): number {
	return inv.quick.findIndex((stack) => !!stack && !!ITEMS[stack.item]?.[ability]);
}

/** Use up one from a quick-use slot. */
export function spendQuick(inv: Inventory, index: number): void {
	const stack = inv.quick[index];
	if (!stack) return;
	if (stack.count > 1) {
		stack.count--;
		return;
	}
	inv.quick[index] = null;
	if (inv.selected === HAND.quick + index) inv.selected = HAND.primary;
}

/** What is worn in the defense slot: shield points left of its full shield. Null when nothing is. */
export function shieldOf(inv: Inventory): { left: number; max: number } | null {
	const worn = inv.equipment.defense;
	const max = (worn && ITEMS[worn.item]?.defense?.shield) || 0;
	if (!worn || max <= 0) return null;
	return { left: Math.max(0, max - (worn.worn ?? 0)), max };
}

/**
 * A creature's blow lands on what is worn first: its shield takes what it can, and the rest gets
 * through to the wearer. Returns that rest, and the item if the blow used the last of its shield
 * (it is torn apart: gone from the defense slot).
 */
export function absorbBlow(
	inv: Inventory,
	damage: number
): { through: number; torn: string | null } {
	const worn = inv.equipment.defense;
	const shield = shieldOf(inv);
	if (!worn || !shield) return { through: damage, torn: null };
	const taken = Math.min(shield.left, damage);
	worn.worn = (worn.worn ?? 0) + taken;
	if (taken < shield.left) return { through: damage - taken, torn: null };
	inv.equipment.defense = null;
	return { through: damage - taken, torn: worn.item };
}

/** Every slot of an inventory, in the order things are looked for: backpack, quick use, worn. */
function inventoryRefs(inv: Inventory): SlotRef[] {
	return [
		...inv.backpack.map((_, index): SlotRef => ({ area: 'backpack', index })),
		...inv.quick.map((_, index): SlotRef => ({ area: 'quick', index })),
		...EQUIPMENT.map((slot): SlotRef => ({ area: 'equipment', slot }))
	];
}

/** How many of an item are carried anywhere. */
export function carriedCount(inv: Inventory, item: string): number {
	let count = 0;
	for (const stack of allStacks(inv)) if (stack.item === item) count += stack.count;
	return count;
}

/** Everything carried, as stacks (the results screen, dropping on death). */
export function allStacks(inv: Inventory): ItemStack[] {
	const stacks: ItemStack[] = [];
	for (const slot of EQUIPMENT) {
		const stack = inv.equipment[slot];
		if (stack) stacks.push({ ...stack });
	}
	for (const stack of [...inv.quick, ...inv.backpack]) if (stack) stacks.push({ ...stack });
	return stacks;
}

/** Weight (kg) of everything carried. */
export function carriedWeight(inv: Inventory): number {
	let weight = 0;
	for (const stack of allStacks(inv)) weight += stackWeight(stack);
	return weight;
}

/** What the loot carried would sell for. */
export function lootValue(inv: Inventory): number {
	let value = 0;
	for (const stack of allStacks(inv)) value += (ITEMS[stack.item]?.value ?? 0) * stack.count;
	return value;
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

/** Whether a slot takes an item: the equipment and quick-use slots only take their own kind. */
export function accepts(ref: SlotRef, item: string): boolean {
	const def = ITEMS[item];
	if (!def || def.maxStack < 1) return false;
	if (ref.area === 'quick') return def.category === 'quick';
	if (ref.area === 'equipment') {
		return def.category === (ref.slot === 'defense' ? 'defense' : 'weapon');
	}
	return true;
}

/** What is in a slot; null if it is empty or there is no such slot. */
export function getSlot(b: Belongings, ref: SlotRef): ItemStack | null {
	if (ref.area === 'equipment') return b.inventory.equipment[ref.slot] ?? null;
	return list(b, ref.area)?.[ref.index] ?? null;
}

function setSlot(b: Belongings, ref: SlotRef, stack: ItemStack | null): void {
	if (ref.area === 'equipment') b.inventory.equipment[ref.slot] = stack;
	else {
		const slots = list(b, ref.area);
		if (slots && ref.index < slots.length) slots[ref.index] = stack;
	}
}

function list(b: Belongings, area: 'stash' | 'backpack' | 'quick'): Slots | undefined {
	if (area === 'stash') return b.stash;
	return area === 'backpack' ? b.inventory.backpack : b.inventory.quick;
}

/** Whether there is such a slot here. */
function exists(b: Belongings, ref: SlotRef): boolean {
	if (ref.area === 'equipment') return EQUIPMENT.includes(ref.slot);
	const slots = list(b, ref.area);
	if (ref.area === 'stash' && b.sealed?.has(ref.index)) return false;
	return !!slots && ref.index >= 0 && ref.index < slots.length;
}

function sameSlot(a: SlotRef, b: SlotRef): boolean {
	if (a.area === 'equipment') return b.area === 'equipment' && a.slot === b.slot;
	return b.area === a.area && a.index === b.index;
}

/** The equipment or quick-use slots an item belongs in (none for things that only go in a pack). */
function ownSlots(inv: Inventory, category: ItemCategory): SlotRef[] {
	if (category === 'weapon') {
		return [
			{ area: 'equipment', slot: 'primary' },
			{ area: 'equipment', slot: 'secondary' }
		];
	}
	if (category === 'defense') return [{ area: 'equipment', slot: 'defense' }];
	if (category === 'quick') return inv.quick.map((_, index): SlotRef => ({ area: 'quick', index }));
	return [];
}

function refs(b: Belongings, area: 'stash' | 'backpack' | 'quick'): SlotRef[] {
	return (list(b, area) ?? [])
		.map((_, index): SlotRef => ({ area, index }))
		.filter((ref) => exists(b, ref));
}

/**
 * Put up to `count` of a stack into these slots, in order: first onto stacks of the same item,
 * then into empty slots. Returns how many went in.
 */
function put(b: Belongings, into: SlotRef[], stack: ItemStack, count: number): number {
	const limit = maxStack(stack.item);
	let left = count;
	if (limit > 1) {
		for (const ref of into) {
			if (left <= 0) break;
			const there = getSlot(b, ref);
			if (!there || there.item !== stack.item) continue;
			const added = Math.min(limit - there.count, left);
			if (added <= 0) continue;
			there.count += added;
			left -= added;
		}
	}
	for (const ref of into) {
		if (left <= 0) break;
		if (getSlot(b, ref) || !accepts(ref, stack.item)) continue;
		const added = Math.min(limit, left);
		if (added <= 0) break;
		setSlot(b, ref, { ...stack, count: added });
		left -= added;
	}
	return count - left;
}

/** Take `count` off a stack in a slot (emptying the slot when nothing is left). */
function reduce(b: Belongings, ref: SlotRef, count: number): void {
	const stack = getSlot(b, ref);
	if (!stack) return;
	if (count >= stack.count) setSlot(b, ref, null);
	else stack.count -= count;
}

/**
 * Put a stack in a list of slots (the stash): onto stacks of the same item, then into empty
 * slots. Returns how many didn't fit.
 */
export function addToSlots(slots: Slots, stack: ItemStack): number {
	const b: Belongings = { inventory: emptyInventory(), stash: slots };
	return stack.count - put(b, refs(b, 'stash'), stack, stack.count);
}

/** Whether at least one of a stack could be picked up, or why not. */
export function canTake(inv: Inventory, stack: ItemStack): 'ok' | 'heavy' | 'full' {
	const def = ITEMS[stack.item];
	if (!def || def.maxStack < 1) return 'full';
	if (unitsByWeight(inv, def.weight) < 1) return 'heavy';
	const copy = cloneInventory(inv);
	return place({ inventory: copy }, def, { ...stack, count: 1 }, 1, true) > 0 ? 'ok' : 'full';
}

/**
 * Add an item to an inventory (a pickup, an admin gift, the stash to the loadout): onto stacks of
 * the same item, then into the slot it belongs in (a weapon slot, the defense slot, a quick-use
 * slot), then the backpack. Nothing is taken past the maximum weight. Returns how many didn't
 * fit.
 */
export function addItem(inv: Inventory, stack: ItemStack): number {
	const def = ITEMS[stack.item];
	if (!def || def.maxStack < 1) return stack.count;
	const count = Math.min(stack.count, unitsByWeight(inv, def.weight));
	if (count <= 0) return stack.count;
	return stack.count - place({ inventory: inv }, def, stack, count, true);
}

/** Into the item's own slots and, with `pack`, the backpack. Returns how many went in. */
function place(
	b: Belongings,
	def: ItemDef,
	stack: ItemStack,
	count: number,
	pack: boolean
): number {
	const into = ownSlots(b.inventory, def.category);
	if (pack) into.push(...refs(b, 'backpack'));
	return put(b, into, stack, count);
}

/**
 * Move a stack (or `count` of it) onto another slot: into it if it is empty, onto a stack of the
 * same item as far as it fits, or swapping places with what is there.
 */
export function moveStack(b: Belongings, from: SlotRef, to: SlotRef, count?: number): MoveResult {
	if (!exists(b, from) || !exists(b, to) || sameSlot(from, to)) return 'refused';
	const moving = getSlot(b, from);
	if (!moving || !accepts(to, moving.item)) return 'refused';
	let n = Math.max(1, Math.min(moving.count, Math.floor(count ?? moving.count)));
	const there = getSlot(b, to);
	const weight = ITEMS[moving.item]?.weight ?? 0;
	const taking = from.area === 'stash' && to.area !== 'stash';

	if (there && (there.item !== moving.item || maxStack(moving.item) <= 1)) {
		// Swap: the whole stack, and what comes back has to be allowed where this one was.
		if (n !== moving.count || !accepts(from, there.item)) return 'refused';
		// Across the line between the stash and the loadout, the load changes by the difference.
		const into = taking ? 1 : from.area !== 'stash' && to.area === 'stash' ? -1 : 0;
		const change = into * (stackWeight(moving) - stackWeight(there));
		if (change > 0 && carriedWeight(b.inventory) + change > CARRY.max + 1e-9) return 'heavy';
		setSlot(b, from, there);
		setSlot(b, to, moving);
		return 'ok';
	}

	if (taking) {
		n = Math.min(n, unitsByWeight(b.inventory, weight));
		if (n < 1) return 'heavy';
	}
	if (there) n = Math.min(n, maxStack(moving.item) - there.count);
	if (n < 1) return 'refused';
	if (there) there.count += n;
	else setSlot(b, to, { ...moving, count: n });
	reduce(b, from, n);
	return 'ok';
}

/**
 * Shift-click. With a stash: from the stash to wherever it belongs in the loadout, and from the
 * loadout back to the stash. Without one (underground): from the backpack to the slot it belongs
 * in, and from there back to the backpack. As much of the stack as fits.
 */
export function quickMove(b: Belongings, from: SlotRef): MoveResult {
	const stack = exists(b, from) ? getSlot(b, from) : null;
	const def = stack ? ITEMS[stack.item] : undefined;
	if (!stack || !def) return 'refused';
	let moved: number;
	if (from.area === 'stash') {
		const count = Math.min(stack.count, unitsByWeight(b.inventory, def.weight));
		if (count < 1) return 'heavy';
		moved = place(b, def, stack, count, true);
	} else if (b.stash) {
		moved = put(b, refs(b, 'stash'), stack, stack.count);
	} else if (from.area === 'backpack') {
		moved = place(b, def, stack, stack.count, false);
	} else {
		moved = put(b, refs(b, 'backpack'), stack, stack.count);
	}
	if (moved < 1) return 'refused';
	reduce(b, from, moved);
	return 'ok';
}

/** From the stash or the backpack into the weapon, defense or quick-use slot it belongs in. */
export function equip(b: Belongings, from: SlotRef): MoveResult {
	const stack = exists(b, from) ? getSlot(b, from) : null;
	const def = stack ? ITEMS[stack.item] : undefined;
	if (!stack || !def || (from.area !== 'stash' && from.area !== 'backpack')) return 'refused';
	let count = stack.count;
	if (from.area === 'stash') {
		count = Math.min(count, unitsByWeight(b.inventory, def.weight));
		if (count < 1) return 'heavy';
	}
	const moved = place(b, def, stack, count, false);
	if (moved < 1) return 'refused';
	reduce(b, from, moved);
	return 'ok';
}

/** Whether `equip` has anywhere to put this (for the menu). */
export function canEquip(b: Belongings, from: SlotRef): boolean {
	const copy: Belongings = {
		inventory: cloneInventory(b.inventory),
		stash: b.stash?.map((stack) => (stack ? { ...stack } : null)),
		sealed: b.sealed
	};
	return equip(copy, from) === 'ok';
}

/** Part of a stack into the first empty slot of the same place (quick-use: else the backpack). */
export function splitStack(b: Belongings, from: SlotRef, count: number): MoveResult {
	const stack = exists(b, from) ? getSlot(b, from) : null;
	const n = Math.floor(count);
	if (!stack || from.area === 'equipment' || n < 1 || n >= stack.count) return 'refused';
	const into = refs(b, from.area);
	if (from.area === 'quick') into.push(...refs(b, 'backpack'));
	const empty = into.find((ref) => !getSlot(b, ref));
	if (!empty) return 'refused';
	setSlot(b, empty, { ...stack, count: n });
	stack.count -= n;
	return 'ok';
}

/** Take up to `count` out of a slot (to drop, sell or discard it). Null if nothing is there. */
export function takeStack(b: Belongings, from: SlotRef, count: number): ItemStack | null {
	const stack = exists(b, from) ? getSlot(b, from) : null;
	if (!stack) return null;
	const taken = Math.max(1, Math.min(stack.count, Math.floor(count)));
	reduce(b, from, taken);
	return { ...stack, count: taken };
}

/**
 * Carry out a request from an inventory screen. A `drop` hands back what came out, for the
 * caller to put on the floor (underground) or throw away (on the surface).
 */
export function applyAction(
	b: Belongings,
	action: InventoryAction
): { result: MoveResult; dropped?: ItemStack } {
	switch (action.kind) {
		case 'move':
			return { result: moveStack(b, action.from, action.to, action.count) };
		case 'quick':
			return { result: quickMove(b, action.from) };
		case 'equip':
			return { result: equip(b, action.from) };
		case 'split':
			return { result: splitStack(b, action.from, action.count) };
		case 'drop': {
			const dropped = takeStack(b, action.from, action.count);
			return dropped ? { result: 'ok', dropped } : { result: 'refused' };
		}
	}
}

/** Remove up to `count` of an item from wherever it is carried; returns how many were removed. */
export function removeItem(inv: Inventory, item: string, count: number): number {
	const b: Belongings = { inventory: inv };
	let left = count;
	for (const ref of inventoryRefs(inv)) {
		if (left <= 0) break;
		const stack = getSlot(b, ref);
		if (stack?.item !== item) continue;
		const taken = Math.min(stack.count, left);
		reduce(b, ref, taken);
		left -= taken;
	}
	// The hand never points at a quick-use slot that has just been emptied.
	if (handRef(inv, inv.selected)?.area === 'quick' && !held(inv)) inv.selected = HAND.primary;
	return count - left;
}

/** Check an untrusted request (from the network). `stash`: whether it may name stash slots. */
export function sanitizeAction(raw: unknown, stash = false): InventoryAction | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const a = raw as Record<string, unknown>;
	const from = sanitizeRef(a.from, stash);
	if (!from) return null;
	const count =
		typeof a.count === 'number' && Number.isFinite(a.count)
			? Math.max(1, Math.min(999, Math.floor(a.count)))
			: undefined;
	switch (a.kind) {
		case 'move': {
			const to = sanitizeRef(a.to, stash);
			return to ? { kind: 'move', from, to, ...(count ? { count } : {}) } : null;
		}
		case 'quick':
			return { kind: 'quick', from };
		case 'equip':
			return { kind: 'equip', from };
		case 'split':
			return count ? { kind: 'split', from, count } : null;
		case 'drop':
			return { kind: 'drop', from, count: count ?? 1 };
		default:
			return null;
	}
}

/** Check an untrusted slot reference. */
export function sanitizeRef(raw: unknown, stash = false): SlotRef | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (r.area === 'equipment') {
		const slot = EQUIPMENT.find((name) => name === r.slot);
		return slot ? { area: 'equipment', slot } : null;
	}
	if (r.area !== 'backpack' && r.area !== 'quick' && !(stash && r.area === 'stash')) return null;
	if (typeof r.index !== 'number' || !Number.isInteger(r.index) || r.index < 0) return null;
	return { area: r.area, index: r.index };
}

function stackWeight(stack: ItemStack): number {
	return (ITEMS[stack.item]?.weight ?? 0) * stack.count;
}

/** How many of something this heavy can still be carried. */
function unitsByWeight(inv: Inventory, weight: number): number {
	if (weight <= 0) return Infinity;
	return Math.floor((CARRY.max - carriedWeight(inv) + 1e-9) / weight);
}
