/**
 * Rope tuning: laying it along the floor, gathering it up, and tying it at anchors. Climbing
 * it is CLIMB (content/player/movement.ts). See docs/dev/rope.md.
 */
export const ROPE = {
	/** Laid rope gets a point every this many metres walked (each costs that much rope). */
	spacing: 0.5,
	/** How close (m, from the feet) a laid rope has to be to gather it up. */
	pickupReach: 1.1,
	/** Holding interact this long gathers up a laid rope. */
	pickupSeconds: 2,
	/** Holding interact this long ties a rope at an anchor, or unties it. */
	tieSeconds: 3,
	/** Rope used by the knot at an anchor, on top of the drop (m). */
	knot: 1,
	/** Ropes laid in one expedition; past it the oldest is gone. */
	max: 24,
	/** How far creatures hear a rope being tied or untied (m). */
	noise: 3
} as const;

/** Where a tied rope hangs, from an anchor-* marker on the ledge. */
export const ANCHOR = {
	/**
	 * The rope hangs this far out from the tie point (m): just past the lip, as the tie point is
	 * on the edge. A climber's hands reach to `height` above the ledge floor there.
	 */
	overhang: 0.15,
	height: 0.9,
	/** Drawn going over the edge this far out from the tie point (m). */
	lip: 0.08,
	/**
	 * Its post (kit.rope_post): `side` m to the anchor's left looking out over the drop, the knot
	 * `knot` m up it.
	 */
	post: { side: 0.4, knot: 0.7 },
	/**
	 * You stand this far back from the tie point to tie it, and land here hauling up off the rope:
	 * well back from the edge, so carrying on forward doesn't walk you off it.
	 */
	stand: 0.6,
	/** How close (m, from the feet) to the landing a player has to be to tie or untie. */
	reach: 1,
	/** The floor under a drop is looked for no deeper than this below the ledge (m). */
	deepest: 20
} as const;
