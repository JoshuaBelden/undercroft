/**
 * The explorer's map: tuning for sketching what you see into a surveyor's notebook and showing
 * it to a teammate. Each explorer's map is their own. See docs/dev/map.md.
 */
export const SURVEY = {
	/** Seconds of standing still, notebook out, to sketch what is around you. */
	sketchSeconds: 2.5,
	/** How far (m) a sketch reaches: only what is in sight, and no further than this. */
	sketchRange: 12,
	/** Slower than this (m/s across the floor) counts as standing still. */
	stillSpeed: 0.4,
	/** Radius (m) the pencil can be heard. */
	sketchNoise: 4,
	/** Seconds held to show your map to a teammate (and see theirs). */
	shareSeconds: 2,
	/** How close (m) the teammate has to be. */
	shareRange: 3,
	/** Zoom of the map screen: pixels per metre, the least, the most and the default. */
	zoom: { min: 2, max: 24, initial: 8 }
} as const;
