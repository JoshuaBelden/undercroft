import { modelUrl } from '../models.ts';

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

/**
 * Rubble walls (docs/dev/world.md#rubble): a few side passages are blocked by a fall of rubble
 * anyone can see, not hidden. Something that `breaks` rubble in the hand (a pickaxe) breaks a
 * way through; nothing else does.
 */
export const RUBBLE_WALLS = {
	/** How many a map has, at most (after the false walls, from the side passages left). */
	count: 2,
	/** Seconds interact is held, the tool in hand, to break through. */
	seconds: 6,
	/** Radius (m) the breaking is heard, again every `every` seconds; the fall when it gives. */
	noise: 12,
	every: 2,
	fallNoise: 14
};

/**
 * Webs (docs/dev/world.md#webs): a few side passages are spun shut with web. Swinging anything at
 * one tears it, a few blows; a blade that `cuts` webs (a hatchet) in one; fire burns it away.
 */
export const WEBS = {
	/** How many a map has, at most (after the false walls and rubble). */
	count: 2,
	/** Blows of an ordinary weapon to tear one down. */
	hits: 3,
	/** A fire burns a web this far (m) beyond its own radius. */
	burn: 1,
	/** Its model (scripts/blender/props.py `build_spider_web`): two bowed sheets of strands. */
	model: modelUrl('shared/props/spider-web.glb'),
	/**
	 * How torn it looks after each blow short of the last (0..1 of it cut away in holes), and how
	 * long a blow shakes it (s).
	 */
	torn: 0.3,
	shake: 0.6
};
