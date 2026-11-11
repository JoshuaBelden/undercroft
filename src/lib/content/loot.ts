/**
 * Loot lying in the catacombs: what explorers carry out and sell. For now a single stand-in item;
 * real loot types, containers and tables come later. See docs/dev/economy.md.
 */
export const LOOT = {
	/** The item scattered (key into ITEMS; its `value` is what it sells for). */
	item: 'relic',
	/** Roughly this many per hall or room cell of the map. */
	perCell: 0.15,
	/** None closer than this to where players start (m, along the floor). */
	minDistance: 12,
	/** At least this far apart (m). */
	spacing: 4,
	/**
	 * How strongly it favours the far end of the map: the chance of a spot being used is its
	 * distance from the start (as a fraction of the farthest) to this power. 0 spreads it evenly.
	 */
	depthBias: 2
};
