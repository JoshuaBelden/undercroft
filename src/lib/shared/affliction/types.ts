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
 * The rite as players know it so far. Slots no hint has revealed are null, and `room` is null
 * until its hint is found. See docs/dev/rite.md.
 */
export interface RiteSnapshot {
	requirements: ({ item: string; count: number } | null)[];
	/** Piece id of the room the rite is performed in. */
	room: string | null;
	/** Seconds the holder holds interact. */
	seconds: number;
	/** The hints found so far, in the order they are learned. */
	hints: string[];
	/** The rite has been performed in this expedition. */
	resolved: boolean;
}

/**
 * The Affliction as broadcast in each tick: the omen stage, how near it is to arriving (`meter`,
 * shown as the arrival bar) and how long is left before everyone must be out.
 */
export interface AfflictionSnapshot {
	id: string;
	/** 0 = no omens yet, 1.. = the def's stages. */
	omen: number;
	manifestation: ManifestationSnapshot | null;
	rite: RiteSnapshot;
	/** 0..1: at 1 it manifests. */
	meter: number;
	/** The rite was performed: it is calmed for the rest of the expedition. */
	calmed: boolean;
	/** Seconds left before anyone still underground is lost. */
	deadline: number;
}
