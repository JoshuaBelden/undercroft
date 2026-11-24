import type { Vec3 } from './AudioManager.ts';

/**
 * Sound captions: what the player would have heard, as text. `SoundBank` raises a cue for every
 * audible sound that has a `caption`; the game decides how to show them.
 */

/** Which way a sound came from, relative to where the listener faces. */
export type CaptionDirection = 'ahead' | 'behind' | 'left' | 'right' | 'above' | 'below';

/** One caption: a sound the listener could hear. */
export interface CaptionCue<Id extends string = string> {
	/** The sound's id (a repeat of the same sound can refresh one caption rather than add one). */
	id: Id;
	/** Its `SoundDef.caption`. */
	text: string;
	/** Where it came from relative to the view; null for sounds with no source in the world. */
	direction: CaptionDirection | null;
}

/** Closer than this (m) a sound has no useful direction. */
const NEAR = 0.75;
/** A source is above or below when it is this much higher or lower (m) and steeper than 45 degrees. */
const VERTICAL = 2;

/**
 * Which way a sound lies for the listener. Steeply above or below (2 m or more, at over 45°) wins;
 * otherwise whichever of ahead, behind, left or right is strongest.
 * @param position - The listener's position.
 * @param forward - The direction the listener faces.
 * @param source - Where the sound is.
 * @returns The direction, or null within 0.75 m (too close to have one).
 */
export function captionDirection(
	position: Vec3,
	forward: Vec3,
	source: Vec3
): CaptionDirection | null {
	const dx = source[0] - position[0];
	const dy = source[1] - position[1];
	const dz = source[2] - position[2];
	const flat = Math.hypot(dx, dz);
	if (Math.abs(dy) >= VERTICAL && Math.abs(dy) > flat) return dy > 0 ? 'above' : 'below';
	if (flat < NEAR) return null;
	// Right of the view is forward x up = (-fz, 0, fx).
	const front = dx * forward[0] + dz * forward[2];
	const side = dx * -forward[2] + dz * forward[0];
	if (Math.abs(front) >= Math.abs(side)) return front > 0 ? 'ahead' : 'behind';
	return side > 0 ? 'right' : 'left';
}
