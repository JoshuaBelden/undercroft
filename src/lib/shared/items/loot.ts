import { RARITIES, rarityOf, type Rarity } from '../../content/items.ts';
import {
	CRATES,
	CRATE_LOOT,
	CRATE_RARITY,
	LOOSE_LOOT,
	type LootEntry
} from '../../content/loot.ts';
import type { ItemStack } from '../player/types.ts';
import type { Rng } from '../rng.ts';
import { emptySlots, maxStack, newStack, type Slots } from './inventory.ts';

/**
 * Rolling loot from the tables in src/lib/content/loot.ts. `depth` is 0 at the start of the map
 * and 1 at the farthest point from it. Seeded, so a map seed gives the same loot.
 * See docs/dev/economy.md.
 */

function lerp([a, b]: [number, number], t: number): number {
	return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** One stack drawn from these entries by weight, or null if there are none. */
function draw(pool: LootEntry[], depth: number, rng: Rng): ItemStack | null {
	if (pool.length === 0) return null;
	const entry = rng.weighted<LootEntry>(pool, (e) => lerp(e.weight, depth));
	const count = Math.min(maxStack(entry.item), rng.int(entry.count[0], entry.count[1]));
	return count > 0 ? newStack(entry.item, count) : null;
}

/**
 * What a crate holds: its slots, filled from the first, commonest things first so the best is
 * the last to be revealed.
 */
export function rollCrate(depth: number, rng: Rng): Slots {
	const counts = new Map<Rarity, number>();
	for (const { id } of RARITIES) {
		const { count, chance } = CRATE_RARITY[id];
		let n = count[0];
		for (let i = count[0]; i < count[1]; i++) if (rng.next() < lerp(chance, depth)) n++;
		counts.set(id, n);
	}
	// Never both of the two best.
	if ((counts.get('epic') ?? 0) > 0 && (counts.get('legendary') ?? 0) > 0) {
		counts.set(rng.next() < 0.5 ? 'epic' : 'legendary', 0);
	}
	const found: ItemStack[] = [];
	for (const { id } of RARITIES) {
		const pool = CRATE_LOOT.filter((entry) => rarityOf(entry.item) === id);
		for (let i = 0; i < (counts.get(id) ?? 0); i++) {
			// Never the same thing twice: what is drawn leaves the pool.
			const stack = draw(pool, depth, rng);
			if (!stack) break;
			found.push(stack);
			pool.splice(
				pool.findIndex((entry) => entry.item === stack.item),
				1
			);
		}
	}
	// Too much for the crate: the commonest are left out.
	const kept = found.slice(Math.max(0, found.length - CRATES.slots));
	const slots = emptySlots(CRATES.slots);
	kept.forEach((stack, index) => (slots[index] = stack));
	return slots;
}

/** Something lying loose on the floor. */
export function rollLoose(depth: number, rng: Rng): ItemStack | null {
	const pool = CRATE_LOOT.filter((entry) => LOOSE_LOOT.rarities.includes(rarityOf(entry.item)));
	return draw(pool, depth, rng);
}
