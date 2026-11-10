/**
 * Expedition rules. Shared by the server (authoritative) and client prediction.
 * See docs/dev/expedition.md.
 */
export const EXPEDITION = {
	/** Seconds to hold interact at an extraction point to climb out. */
	extractSeconds: 3,
	/** How close (metres, horizontally) the player must be to an extraction point. */
	extractRadius: 1.6,
	/** ...and within this height of it. */
	extractHeight: 1.0
};
