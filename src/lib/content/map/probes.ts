/**
 * Light probes (docs/dev/fixed-map.md#light-probes): how the baked light reaches what moves.
 */
export const PROBES = {
	/**
	 * How bright the probes light things against the baked room: 1 is the bake's own light. The
	 * room's lightmap tops out (it is clipped at 1 where the daylight is strongest), the probes
	 * don't, so they are turned down to sit alongside it. Tune by eye.
	 */
	gain: 0.4,
	/** Seconds between looks through the scene for new things to light (an item dropped, a crate). */
	sweepEvery: 0.5
} as const;
