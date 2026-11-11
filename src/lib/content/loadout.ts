/**
 * What every player starts an expedition with, until the hub (buying gear, choosing a loadout)
 * exists. Item ids are keys of ITEMS. See docs/dev/items.md.
 */
export const STARTING_LOADOUT: {
	hotbar: { item: string; loaded?: number }[];
	pockets: Record<string, number>;
} = {
	hotbar: [{ item: 'knife' }, { item: 'revolver', loaded: 6 }],
	pockets: { bandage: 2, salts: 1 }
};

/** Bricks lying around the map: roughly one per this many hall or room cells. */
export const BRICKS_PER_CELL = 0.5;
