import type { Vec3 } from '../map/types.ts';

/** The Affliction's manifestation as clients see it. See docs/dev/affliction.md. */
export interface ManifestationSnapshot {
	/** Floor point under its core. */
	position: Vec3;
	/** Gathering (standing where it appeared), hunting, or banished (fading away). */
	state: 'gathering' | 'hunting' | 'banished';
	/** Light is on it: weapons hurt it now. */
	exposed: boolean;
	/** 0..1: how near the light held on it is to exposing it (1 while exposed). */
	charge: number;
	/** Stunned (a strobe): it stands still and can't strike. */
	stunned: boolean;
	/**
	 * How many swings it has begun so far: each new one is a strike to show, from its wind-up.
	 * The blow lands partway through (`strikeAt`).
	 */
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
	/** The rite has been performed in this expedition: it summoned the manifestation. */
	performed: boolean;
	/** The manifestation the rite summoned has been banished: the Affliction is resolved. */
	resolved: boolean;
}

/**
 * The Affliction as broadcast in each tick: the omen stage, the hidden meter (for admin tools;
 * never shown to players) and how long is left before everyone must be out.
 */
export interface AfflictionSnapshot {
	id: string;
	/** 0 = no omens yet, 1.. = the def's stages. */
	omen: number;
	manifestation: ManifestationSnapshot | null;
	rite: RiteSnapshot;
	/** 0..1: drives the omen stages. Nothing manifests when it fills. */
	meter: number;
	/** It was resolved (the rite, then banishing what it summoned): calmed for the rest of the run. */
	calmed: boolean;
	/** Seconds left before anyone still underground is lost. */
	deadline: number;
}
