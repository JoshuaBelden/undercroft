import { ITEMS, type ItemDef, type WearUnit } from '../../content/items.ts';
import type { ItemStack } from '../player/types.ts';

/**
 * Durability: how worn an item is, and whether it is broken. Shared by the simulation (a broken
 * gun only dry-clicks), the server (wear from hits, shots and blows), the store (worn things sell
 * for less) and the interface (the durability bar, the broken mark). See
 * docs/dev/items.md#durability.
 *
 * Two kinds of wear:
 * - `durability` (`ItemDef.durability`): the item breaks, and stays where it is, broken, until it
 *   is repaired. Its wear is `ItemStack.worn`.
 * - `melee.breaksAfter` (bricks): it is used up, and gone. Its wear is `ItemStack.uses`.
 */

/** How long an item lasts: its most wear and what that is counted in, and whether it is used up. */
export interface Lasting {
	max: number;
	per: WearUnit;
	/** Gone when it runs out (a brick), rather than broken. */
	usedUp: boolean;
}

/** How long an item lasts, or null if it never wears. */
export function lasting(def: ItemDef | undefined): Lasting | null {
	if (!def) return null;
	if (def.durability && def.durability.max > 0) {
		return { max: def.durability.max, per: def.durability.per, usedUp: false };
	}
	const blows = def.melee?.breaksAfter;
	return blows ? { max: blows, per: 'hit', usedUp: true } : null;
}

/** Wear a stack has taken, in its item's unit. */
export function wearOf(stack: ItemStack): number {
	const last = lasting(ITEMS[stack.item]);
	if (!last) return 0;
	return (last.usedUp ? stack.uses : stack.worn) ?? 0;
}

/** What is left of it, 1 new to 0 broken; null for things that never wear. */
export function condition(stack: ItemStack): number | null {
	const last = lasting(ITEMS[stack.item]);
	if (!last) return null;
	return Math.max(0, Math.min(1, 1 - wearOf(stack) / last.max));
}

/** Broken: it has taken all the wear it can, and does nothing until it is repaired. */
export function isBroken(stack: ItemStack | null | undefined): boolean {
	if (!stack) return false;
	const last = lasting(ITEMS[stack.item]);
	return !!last && !last.usedUp && wearOf(stack) >= last.max;
}

/** Something there, and not broken: it does what it does. */
export function works(stack: ItemStack | null | undefined): stack is ItemStack {
	return !!stack && !isBroken(stack);
}

/**
 * Wear a stack by `amount` of its unit. Returns what came of it: still going, just broke (it
 * stays where it is), or used up (the caller takes it away). Nothing happens to things that never
 * wear, or are broken already.
 */
export function addWear(stack: ItemStack, amount = 1): 'ok' | 'broke' | 'usedUp' {
	const last = lasting(ITEMS[stack.item]);
	if (!last || amount <= 0 || isBroken(stack)) return 'ok';
	if (last.usedUp) {
		stack.uses = (stack.uses ?? 0) + amount;
		return stack.uses >= last.max ? 'usedUp' : 'ok';
	}
	stack.worn = Math.min(last.max, (stack.worn ?? 0) + amount);
	return stack.worn >= last.max ? 'broke' : 'ok';
}

/** As good as new (admin, and the Workshop's repair). */
export function mend(stack: ItemStack): void {
	if (stack.worn !== undefined) stack.worn = 0;
	if (stack.uses !== undefined && lasting(ITEMS[stack.item])?.usedUp) stack.uses = 0;
}

/** Worn out all at once (admin: try the broken state). Used-up things aren't broken, just gone. */
export function wreck(stack: ItemStack): void {
	const last = lasting(ITEMS[stack.item]);
	if (last && !last.usedUp) stack.worn = last.max;
}

/** How a unit of wear reads, for one or many: "1 hit", "40 shots", "12 points". */
export function wearAmount(amount: number, per: WearUnit): string {
	const one = amount === 1;
	switch (per) {
		case 'hit':
			return `${amount} ${one ? 'hit' : 'hits'}`;
		case 'shot':
			return `${amount} ${one ? 'shot' : 'shots'}`;
		case 'point':
			return `${amount} ${one ? 'point' : 'points'}`;
		case 'use':
			return `${amount} ${one ? 'use' : 'uses'}`;
		case 'second':
			return amount >= 120 ? `${Math.round(amount / 60)} min` : `${amount} s`;
	}
}
