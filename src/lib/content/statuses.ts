/**
 * Status effects (data): the catalogue of statuses, and what causes them. A status here is only a
 * name: how long it lasts on a creature and what it does to it belong to that creature (its
 * `statuses` reactions and its own director code). See docs/dev/status.md.
 */

export interface StatusDef {
	id: string;
	/** Player-facing name (help, admin). */
	name: string;
	description: string;
}

export const STATUSES: Record<string, StatusDef> = {
	stunned: {
		id: 'stunned',
		name: 'Stunned',
		description: 'Caught by a sudden flash of light, it falters for a moment.'
	}
};

/**
 * How one creature takes a status: `seconds` it lasts on it, then `immunity` seconds before it
 * can have it again. A creature with no reaction to a status never gets it.
 */
export interface StatusReaction {
	seconds: number;
	immunity: number;
}

export type StatusReactions = Partial<Record<string, StatusReaction>>;

/** Something in the world that causes a status: a creature lists the ones it is vulnerable to. */
export type StatusSource = 'strobe';

/**
 * The strobe: a headlamp turned on from off (at any level). A vulnerable creature that this one
 * lamp lights at least `light` (lamp units, on its core) gets `causes`.
 */
export const STROBE = { light: 0.05, causes: 'stunned' } as const;
