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
	extractHeight: 1.0,
	/**
	 * Leaving alive (climbing out, abandoning, the dark banished or resolved): seconds the
	 * "Extracting" screen takes to fade to black before the results show.
	 */
	leaveFadeSeconds: 3.5,
	/** Arriving: seconds the screen takes to fade from black into the start room. */
	arriveFadeSeconds: 1.8,
	/** The countdown ran out but no run arrived in this long: the dark lifts (a failed launch). */
	descentGiveUpSeconds: 20
};
