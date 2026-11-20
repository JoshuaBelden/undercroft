import type { Rarity } from './items.ts';

/**
 * Loot: where lootables stand and how they are gone through, and the little that lies loose on the
 * floor. What each kind of lootable is, opens with and holds is in src/lib/content/lootables.ts;
 * every item has a rarity (`ItemDef.rarity`). See docs/dev/lootables.md and docs/dev/economy.md.
 */

/** Lootables in general: where they stand, and going through one. */
export const CRATES = {
	/** Slots across on the loot screen. */
	columns: 4,
	/** Seconds it takes to see what is in a slot. Slots are revealed one at a time. */
	revealSeconds: 1,
	/** Chance that a crate marker in a piece has something (about 140 in a map). */
	fill: 0.22,
	/**
	 * Chance that a lootable marker has its lootable: higher, as each was put where its room wants
	 * one (the niches of an ossuary, the lockers of the shaft).
	 */
	lootableFill: 0.45,
	/** None closer than this to where players start (m, in a straight line). */
	minDistance: 10
};

/**
 * The dead: lying by the walls in place of some of the crates (LOOTABLES.corpse is what one is).
 * Only where the body fits.
 */
export const CORPSES = {
	/** About this share of a map's crates are corpses instead (where a body fits). */
	share: 1 / 3,
	/** How far (m) inside a lootable's footprint must be clear of walls: a body doesn't fill its corners. */
	inset: 0.12
};

/**
 * Locked trunks standing in place of some crates (LOOTABLES.trunk is what one is): only on the
 * third level, at random. Rooms that keep one (a family mausoleum) put theirs where they say.
 */
export const TRUNKS = {
	/** The levels of the map (a tier, 0 first) crates turn into trunks on. */
	tiers: [2],
	/** Chance that a crate on such a level is a trunk instead (about ten crates a level). */
	chance: 0.15,
	/** The item that opens one. A map holds one per locked lootable, in ones that aren't locked or jammed. */
	key: 'key'
};

/** Loot lying loose on the floor: sparse, and nothing better than uncommon (from the crate's table). */
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
	/** Which rarities it is drawn from (out of the crate's table). */
	rarities: ['common', 'uncommon'] as Rarity[]
};
