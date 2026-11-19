/**
 * Candles standing in the map (candle-* markers in a piece, such as the start room's): a flame
 * at each wick, and one warm light for the room they stand in. See docs/dev/map-generation.md
 * (Candles).
 */
export const CANDLES = {
	/** One light per piece with candles, over the middle of them; it casts no shadows. */
	light: {
		color: 0xffb066,
		/** Candela at full strength (a headlamp on low is 7, on bright 55). */
		intensity: 14,
		/** Range (m) and falloff. */
		distance: 11,
		decay: 1.4,
		/** Hung this far (m) over the highest wick, so low walls (the well curb) don't hide it. */
		above: 1.2
	},
	/**
	 * The light fades out between these distances (m) from the camera, and off it counts nothing
	 * against the light budget: lit in the room and down the pit, dark once you have gone on.
	 */
	fade: [12, 18] as [number, number],
	/** The flicker: how much of the light comes and goes, and how fast. */
	flicker: { depth: 0.18, speed: 9 },
	/** The flame drawn at each wick (m across). */
	flame: { size: 0.09, color: 0xffc27a }
};
