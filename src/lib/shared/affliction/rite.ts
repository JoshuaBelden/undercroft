import type { RiteSpec } from '../../content/afflictions.ts';
import { ITEMS } from '../../content/items.ts';
import { allStacks, carriedCount, removeItem } from '../items/inventory.ts';
import type { Inventory } from '../player/types.ts';
import type { RiteSnapshot } from './types.ts';

/**
 * Rite rules shared by the server (authoritative) and the client (prompt, rite overlay, the
 * Afflictions page). See docs/dev/rite.md.
 */

/** What `clues` found hints reveal: the first `clues` hints, in order, and what they name. */
export function revealed(
	spec: RiteSpec,
	clues: number
): { hints: string[]; slots: boolean[]; room: boolean } {
	const found = spec.clues.slice(0, Math.max(0, clues));
	// Once every hint is found nothing is hidden, even a requirement no hint names.
	const done = clues >= spec.clues.length;
	const named = new Set(found.map((clue) => clue.reveals));
	return {
		hints: found.map((clue) => clue.text),
		slots: spec.requirements.map((r) => done || named.has(r.item)),
		room: done || named.has('room')
	};
}

/** The rite as clients may see it: hidden slots are null. */
export function riteSnapshot(
	spec: RiteSpec,
	clues: number,
	performed = false,
	resolved = false
): RiteSnapshot {
	const known = revealed(spec, clues);
	return {
		requirements: spec.requirements.map((r, i) =>
			known.slots[i] ? { item: r.item, count: r.count } : null
		),
		room: known.room ? spec.room : null,
		seconds: spec.seconds,
		hints: known.hints,
		performed,
		resolved
	};
}

/** Whether an inventory holds every (known) requirement. */
export function carriesAll(
	inv: Inventory,
	requirements: readonly ({ item: string; count: number } | null)[]
): boolean {
	return requirements.every((r) => r !== null && riteCount(inv, r.item) >= r.count);
}

/** How many of an item the rite counts as carried: the item, and what counts as it (`countsAs`). */
export function riteCount(inv: Inventory, item: string): number {
	let n = carriedCount(inv, item);
	for (const stack of allStacks(inv)) {
		const as = ITEMS[stack.item]?.countsAs;
		if (as?.item === item) n += as.count * stack.count;
	}
	return n;
}

/**
 * Use up `count` of an item for the rite: the item itself first, then as few of what counts as it
 * (a black candle) as make up the rest.
 */
export function takeForRite(inv: Inventory, item: string, count: number): void {
	let wanting = count - removeItem(inv, item, count);
	for (const stack of allStacks(inv)) {
		if (wanting <= 0) break;
		const as = ITEMS[stack.item]?.countsAs;
		if (as?.item !== item) continue;
		const need = Math.min(stack.count, Math.ceil(wanting / as.count));
		removeItem(inv, stack.item, need);
		wanting -= need * as.count;
	}
}
