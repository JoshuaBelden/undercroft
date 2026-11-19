/**
 * False walls (docs/dev/map-generation.md#false-walls): a few openings in each map are walled up
 * to look like any capped dead end, with a side passage hidden behind. A crowbar in the hand
 * brings one down; prying at an ordinary dead end does nothing.
 */
export const FALSE_WALLS = {
	/** How many a map has, at most (fewer if it has too few side passages to hide). */
	count: 3,
	/** The passage behind one: at least and at most this many pieces. */
	pieces: [2, 14] as [number, number],
	/** Seconds interact is held with a crowbar on a dead end's wall to pry at it. */
	prySeconds: 5,
	/** Radius (m) prying is heard, again every `pryEvery` seconds while it goes on. */
	pryNoise: 10,
	pryEvery: 2,
	/** Radius (m) a wall coming down is heard. */
	fallNoise: 16,
	/** How near (m, from the eye) and how directly (radians) a dead end's wall is looked at. */
	reach: 2,
	angle: 0.45,
	/** Height (m) over the floor of the point on the wall that is looked at. */
	height: 1.3,
	/** How far (m) in front of the opening the face of a cap stands. */
	depth: 0.25
};
