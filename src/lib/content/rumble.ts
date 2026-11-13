/**
 * Controller rumble effects, played with `rumble(id)` (src/lib/game/input/gamepad.ts).
 * See docs/dev/controller.md.
 */

export interface RumbleEffect {
	/** Milliseconds. */
	duration: number;
	/** The heavy, low motor, 0..1. */
	strong: number;
	/** The light, high motor, 0..1. */
	weak: number;
}

export const RUMBLE = {
	/** Firing a gun. */
	shot: { duration: 90, strong: 0.35, weak: 0.8 },
	/** Firing a gun with several pellets (a shotgun). */
	heavyShot: { duration: 160, strong: 0.9, weak: 1 },
	/** Taking a hit. */
	hit: { duration: 220, strong: 0.7, weak: 0.4 },
	/** Going down. */
	downed: { duration: 650, strong: 1, weak: 0.6 }
} as const satisfies Record<string, RumbleEffect>;

export type RumbleId = keyof typeof RUMBLE;
