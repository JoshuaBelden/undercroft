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
	/** Sanity after a teammate revives you by hand, with nothing but a shake and a word. */
	reviveTo: 20,
	/** Sanity after smelling salts bring you round (a teammate's, or your own when alone). */
	saltsReviveTo: 80,
	/** Seconds to hold revive on a downed teammate, by hand. */
	reviveSeconds: 3,
	/** Seconds to hold it with smelling salts to hand: a sniff and they're up. */
	saltsReviveSeconds: 1,
	reviveRange: 1.5,
	/** Seconds a downed player lasts before dying. */
	bleedOut: 60,
	/** Seconds a downed player holds climb to give up and die at once. */
	surrenderSeconds: 1
};

/** How long a revive is held: quicker with smelling salts to hand. */
export function reviveSeconds(salts: boolean): number {
	return salts ? SANITY.saltsReviveSeconds : SANITY.reviveSeconds;
}

/**
 * Using what is in your hand on a teammate (bandaging them, changing their lamp's battery): hold
 * aim while looking at them. See docs/dev/items.md#using-items-on-a-teammate.
 */
export const TEND = {
	/** Reach (m) from your eye to them. */
	range: 2,
	/** How wide a teammate is to look at (m): a little more than their body, to be forgiving. */
	radius: 0.4,
	/** The server still applies it if they are this much further (m) when it is done. */
	slack: 0.5
};
