import type { Vec3 } from '../map/types.ts';

/** The Affliction's manifestation as clients see it. See docs/dev/affliction.md. */
export interface ManifestationSnapshot {
	/** Floor point under its core. */
	position: Vec3;
	/** Gathering (standing where it appeared), hunting, or banished (fading away). */
	state: 'gathering' | 'hunting' | 'banished';
	/** Light is on it: weapons hurt it now. */
	exposed: boolean;
	/** Radius (m) within which it drains sanity. */
	radius: number;
	/** How many times its touch has landed so far: each new one is a strike to show. */
	strikes: number;
}

/**
 * The rite as players know it so far. Slots no clue has revealed are null, and `room` is null
 * until the last clue is found. See docs/dev/rite.md.
 */
export interface RiteSnapshot {
	requirements: ({ item: string; count: number } | null)[];
	/** Piece id of the room the rite is performed in. */
	room: string | null;
	/** Seconds the holder holds interact. */
	seconds: number;
}

/**
 * The Affliction as broadcast in each tick. The meter itself is hidden from players: only the
 * omen stage is sent (and `meter` in dev mode, for the admin panel).
 */
export interface AfflictionSnapshot {
	id: string;
	/** 0 = no omens yet, 1.. = the def's stages. */
	omen: number;
	manifestation: ManifestationSnapshot | null;
	rite: RiteSnapshot;
	/** Dev mode only. */
	meter?: number;
}
