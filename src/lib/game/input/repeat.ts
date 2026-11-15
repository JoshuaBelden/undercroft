import type { Stick } from './gamepad.ts';

/**
 * A direction held in a menu repeats: once as it is pushed, then after `REPEAT_DELAY`, every
 * `REPEAT_EVERY`, at a steady rate (no speed-up). The D-pad and left stick moving the focus, and
 * the right stick stepping a value (`menus.ts`), keep this one timing. See docs/dev/controller.md.
 */

/** Milliseconds a direction is held before it repeats, and then between repeats. */
export const REPEAT_DELAY = 400;
export const REPEAT_EVERY = 90;
/** How far the right stick is pushed left or right (past its dead zone) before it steps a value. */
export const STICK_STEP = 0.5;

/** Fewer (-1), more (1), or neither (0). */
export type Step = -1 | 0 | 1;

/**
 * Which way a stick steps a value: left (-1) or right (1) once pushed at least `push` that way,
 * and more sideways than up or down (so scrolling with a sloppy push doesn't step); 0 otherwise.
 */
export function stickStep(stick: Stick, push = STICK_STEP): Step {
	const across = Math.abs(stick.x);
	if (across < push || across <= Math.abs(stick.y)) return 0;
	return stick.x < 0 ? -1 : 1;
}

/** A direction held, read every frame, and when it next repeats. */
export class Repeat {
	private held: Step = 0;
	private at = 0;

	/**
	 * Give it the direction held now (0 for none) each frame; it says which way to step this
	 * frame: the direction as it is pushed (or turned the other way), then at each repeat, else 0.
	 */
	next(direction: Step, now: number): Step {
		if (direction !== this.held) {
			this.held = direction;
			this.at = now + REPEAT_DELAY;
			return direction;
		}
		if (direction === 0 || now < this.at) return 0;
		this.at = now + REPEAT_EVERY;
		return direction;
	}

	/** Let go: the next push steps at once. */
	reset(): void {
		this.held = 0;
	}
}
