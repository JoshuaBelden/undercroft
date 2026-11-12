import type { Rarity } from './items.ts';

/**
 * Loot: what explorers carry out and sell, and where it is found. Most of it is in crates; a
 * little lies loose on the floor. Every item has a rarity (`ItemDef.rarity`), and a crate holds a
 * set number of each. See docs/dev/economy.md and docs/dev/items.md.
 */

export interface LootEntry {
	/** Key into ITEMS. Its rarity decides which of a crate's picks it competes for. */
	item: string;
	/** How many come together, lowest and highest (never more than the item's stack). */
	count: [number, number];
	/**
	 * Relative chance among items of the same rarity: near the start, and at the far end of the
	 * map. In between it slides from one to the other.
	 */
	weight: [number, number];
}

/** Everything a crate can hold. */
export const CRATE_LOOT: LootEntry[] = [
	{ item: 'coins', count: [2, 8], weight: [10, 8] },
	{ item: 'rosary', count: [1, 1], weight: [6, 6] },
	{ item: 'bandage', count: [1, 2], weight: [3, 3] },
	{ item: 'ammo.revolver', count: [3, 8], weight: [2, 3] },
	{ item: 'ammo.shotgun', count: [2, 5], weight: [1, 2] },
	{ item: 'salts', count: [1, 1], weight: [1, 2] },
	{ item: 'chalk', count: [1, 2], weight: [3, 2] },
	{ item: 'candle', count: [1, 3], weight: [4, 3] },
	{ item: 'tooth', count: [1, 2], weight: [5, 4] },
	{ item: 'signet', count: [1, 1], weight: [3, 4] },
	{ item: 'candlestick', count: [1, 1], weight: [1, 1] },
	{ item: 'chalice', count: [1, 1], weight: [1, 1] },
	{ item: 'relic', count: [1, 1], weight: [1, 1] }
];

/**
 * How many things of each rarity a crate holds. `count` is the fewest and the most: a crate never
 * has more. Each one above the fewest is there with probability `chance` (near the start, and at
 * the far end of the map), so deep crates lean toward the top of each range.
 *
 * A crate never holds both an epic and a legendary. If all of it is more than the crate has
 * slots, the commonest are left out. Slots are filled commonest first, so the best is revealed
 * last.
 */
export const CRATE_RARITY: Record<Rarity, { count: [number, number]; chance: [number, number] }> = {
	common: { count: [1, 5], chance: [0.35, 0.6] },
	uncommon: { count: [0, 3], chance: [0.25, 0.5] },
	rare: { count: [0, 2], chance: [0.1, 0.3] },
	epic: { count: [0, 1], chance: [0.04, 0.15] },
	legendary: { count: [0, 1], chance: [0.01, 0.06] }
};

/** Loot crates: where they stand, opening one and going through it. */
export const CRATES = {
	/** Slots in a crate, and how many across on the loot screen. */
	slots: 8,
	columns: 4,
	/** Seconds interact is held to open one. */
	openSeconds: 1,
	/** Seconds it takes to see what is in a slot. Slots are revealed one at a time. */
	revealSeconds: 1,
	/** Chance that a crate marker in a piece has a crate. */
	fill: 0.45,
	/** None closer than this to where players start (m, in a straight line). */
	minDistance: 10,
	/**
	 * Its collision box: across, high, deep (m). A little higher than the model, so nothing
	 * counts its lid as a step.
	 */
	size: [0.94, 0.55, 0.64] as [number, number, number],
	/** Radius (m) opening one can be heard. */
	noise: 6,
	/** How far the lid swings open (radians). */
	lidAngle: 1.9
};

/** Loot lying loose on the floor: sparse, and nothing better than uncommon. */
export const LOOSE_LOOT = {
	/** Roughly this many per hall or room cell of the map. */
	perCell: 0.04,
	/** None closer than this to where players start (m, along the floor). */
	minDistance: 12,
	/** At least this far apart (m). */
	spacing: 4,
	/**
	 * How strongly it favours the far end of the map: the chance of a spot being used is its
	 * distance from the start (as a fraction of the farthest) to this power. 0 spreads it evenly.
	 */
	depthBias: 2,
	/** Which rarities it is drawn from (out of CRATE_LOOT). */
	rarities: ['common', 'uncommon'] as Rarity[]
};
