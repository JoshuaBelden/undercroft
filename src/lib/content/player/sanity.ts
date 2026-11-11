/**
 * Sanity is the player's health. Shared by server (authoritative) and client (prediction of the
 * deterministic parts). See docs/dev/player.md (Sanity).
 */
export const SANITY = {
	max: 100,
	/** Per second while your lamp gives no light and no other lamp lights you. */
	darknessDrain: 0.5,
	/** Per second while a creature is visible to you (half-light) within this range. */
	seeingDrain: 1.5,
	seeingRange: 12,
	/** Sanity after being revived (by a teammate or your own smelling salts). */
	reviveTo: 35,
	/** Seconds to hold revive on a downed teammate. */
	reviveSeconds: 3,
	reviveRange: 1.5,
	/** Bandage: seconds to apply (standing still) and sanity restored. */
	bandageSeconds: 3,
	bandageHeal: 25,
	/** Seconds a downed player lasts before dying. */
	bleedOut: 60
};
