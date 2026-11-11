import type { Vec3 } from '../map/types.ts';

/** The Affliction's manifestation as clients see it. See docs/dev/affliction.md. */
export interface ManifestationSnapshot {
	/** Floor point under its core. */
	position: Vec3;
	/** Gathering (lamps failing everywhere), hunting, or banished (dissolving). */
	state: 'gathering' | 'hunting' | 'banished';
	/** Light is on it: weapons hurt it now. */
	exposed: boolean;
	/** Radius (m) of its darkness. */
	radius: number;
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
	/** Dev mode only. */
	meter?: number;
}
