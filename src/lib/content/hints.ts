/**
 * Where a rite's hint items are put in the map (data). A hint is never left on a floor: it is in
 * a crate, on a corpse, hung on a wall at eye level in a major room, or lying on furniture (a
 * sarcophagus, an altar). See docs/dev/rite.md.
 */

export type HintSpotKind = 'crate' | 'corpse' | 'wall' | 'furniture';

export const HINTS = {
	/** Copies take these kinds in turn, so they don't all end up in the same sort of place. */
	order: ['crate', 'wall', 'furniture', 'corpse'] as HintSpotKind[],
	/** Copies are spread from this far (fraction of the way to the farthest point) to this far. */
	bands: [0.15, 0.85] as [number, number],
	/** No two hints closer than this (m). */
	spacing: 3,
	wall: {
		/** Height above the floor (m) a hint is hung at: eye level. */
		height: 1.5,
		/** Furthest (m) from where someone stands to the wall. */
		reach: 2,
		/** Closest (m): not tucked against where you stand. */
		near: 0.4,
		/** Rays this far (m) to each side and up and down must hit the same flat wall. */
		spread: 0.15,
		/** How much (m) those rays may disagree. */
		flatness: 0.04,
		/** Gap (m) between the wall's collider and the hint. */
		standoff: 0.03
	},
	furniture: {
		/** Its top (m above the floor beside it): table, coffin or altar height. */
		minTop: 0.5,
		maxTop: 1.3,
		/** Larger than this (m, half-extent) is a wall or a floor, not furniture. */
		maxHalf: 1.5,
		/** Its foot is within this (m) of the floor. */
		footing: 0.25,
		/** Someone can stand within this (m, horizontally) of the spot on top. */
		reach: 1.2,
		/** Kept this far (m) in from the top's edges. */
		inset: 0.15,
		/** Clear space (m) above the top. */
		headroom: 0.5
	}
};
