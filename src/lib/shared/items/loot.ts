import { ITEMS, RARITIES, rarityOf, type Rarity } from '../../content/items.ts';
import { LOOSE_LOOT } from '../../content/loot.ts';
import {
	LOOTABLES,
	LOOT_BUDGET,
	type LootableDef,
	type LootEntry,
	type RarityCounts
} from '../../content/lootables.ts';
import type { ItemStack } from '../player/types.ts';
import type { Rng } from '../rng.ts';
import { emptySlots, maxStack, newStack, type Slots } from './inventory.ts';

/**
 * Rolling loot from the lootables' tables (src/lib/content/lootables.ts). `depth` is 0 at the
 * start of a lootable's level of the map and 1 at the farthest point of it. Seeded, so a map seed
 * gives the same loot. See docs/dev/lootables.md and docs/dev/economy.md.
 */

function lerp([a, b]: [number, number], t: number): number {
	return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** The lines of a table whose items are in the game (the rest are still to come). */
export function liveEntries(table: LootEntry[]): LootEntry[] {
	return table.filter((entry) => Object.hasOwn(ITEMS, entry.item));
}

/** One stack drawn from these entries by weight, or null if there are none. */
function draw(pool: LootEntry[], depth: number, rng: Rng): ItemStack | null {
	if (pool.length === 0) return null;
	const entry = rng.weighted<LootEntry>(pool, (e) => lerp(e.weight, depth));
	const count = Math.min(maxStack(entry.item), rng.int(entry.count[0], entry.count[1]));
	return count > 0 ? newStack(entry.item, count) : null;
}

/** The rarity counts of a lootable on a level (the deepest it has for any deeper). */
export function countsFor(def: LootableDef, tier: number, sealed = false): RarityCounts {
	const levels = (sealed && def.sealed?.rarity) || def.rarity;
	return levels[Math.max(0, Math.min(tier, levels.length - 1))];
}

/**
 * What a lootable holds: its slots, filled from the first, commonest things first so the best is
 * the last to be revealed. How many of each rarity comes from its counts for its level
 * (`countsFor`: better when it is sealed); the dice are thrown for every rarity either way, so
 * the same seed rolls the same everyday things on every level.
 *
 * With a `prize` (a locked trunk, an alcove) it always holds something epic or legendary: if it
 * rolled neither, one is added, legendary with probability `prize`. Never both of the two best,
 * nor the same thing twice. If it is all more than the slots, the commonest are left out.
 */
export function rollLootable(
	def: LootableDef,
	tier: number,
	depth: number,
	rng: Rng,
	sealed = false
): Slots {
	const table = countsFor(def, tier, sealed);
	const counts = new Map<Rarity, number>();
	for (const { id } of RARITIES) {
		const { count, chance } = table[id];
		let n = count[0];
		for (let i = count[0]; i < count[1]; i++) if (rng.next() < lerp(chance, depth)) n++;
		counts.set(id, n);
	}
	if ((counts.get('epic') ?? 0) > 0 && (counts.get('legendary') ?? 0) > 0) {
		counts.set(rng.next() < 0.5 ? 'epic' : 'legendary', 0);
	}
	if (def.prize !== undefined && !counts.get('epic') && !counts.get('legendary')) {
		counts.set(rng.next() < def.prize ? 'legendary' : 'epic', 1);
	}
	const live = liveEntries(def.loot);
	const found: ItemStack[] = [];
	for (const { id } of RARITIES) {
		const pool = live.filter((entry) => rarityOf(entry.item) === id);
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
	const kept = found.slice(Math.max(0, found.length - def.slots));
	const slots = emptySlots(def.slots);
	kept.forEach((stack, index) => (slots[index] = stack));
	return slots;
}

/** Something lying loose on the floor (from the crate's table, everyday things only). */
export function rollLoose(depth: number, rng: Rng): ItemStack | null {
	const pool = liveEntries(LOOTABLES.crate.loot).filter((entry) =>
		LOOSE_LOOT.rarities.includes(rarityOf(entry.item))
	);
	return draw(pool, depth, rng);
}

/** What the treasure in some slots sells for. */
export function treasureValue(slots: Slots): number {
	let value = 0;
	for (const stack of slots) {
		const def = stack ? ITEMS[stack.item] : undefined;
		if (stack && def?.treasure) value += (def.value ?? 0) * stack.count;
	}
	return value;
}

/**
 * Keep a level's treasure within its budget (`LOOT_BUDGET`): while what its lootables hold is
 * worth more, take a stack of treasure out of one of them, at random. Things put there on purpose
 * (`keep`) stay. Returns how much was taken out.
 */
export function trimToBudget(
	lootables: Slots[],
	tier: number,
	rng: Rng,
	keep: (stack: ItemStack) => boolean = () => false
): number {
	const budget = LOOT_BUDGET[Math.min(tier, LOOT_BUDGET.length - 1)];
	let total = lootables.reduce((sum, slots) => sum + treasureValue(slots), 0);
	let taken = 0;
	while (total > budget) {
		const treasure = lootables.flatMap((slots) =>
			slots.flatMap((stack, index) =>
				stack && ITEMS[stack.item]?.treasure && !keep(stack) ? [{ slots, index, stack }] : []
			)
		);
		if (treasure.length === 0) break;
		const { slots, index, stack } = rng.pick(treasure);
		const value = (ITEMS[stack.item]?.value ?? 0) * stack.count;
		slots[index] = null;
		total -= value;
		taken += value;
	}
	return taken;
}
