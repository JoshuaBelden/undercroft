/**
 * A menu button held down to press a control from anywhere in the menu (Launch, Confirm loadout,
 * the store, Purchase: `data-pad-hold` in menus.ts). It tells a hold from a quick press, which is
 * still the focused control's (an item slot sends or opens its menu). See docs/dev/controller.md.
 */

/** Milliseconds a menu button is held to press its control. Tune the feel here. */
export const HOLD_TIME = 600;

export class Hold {
	/** It ran to the end: its control was pressed. Letting go now does nothing. */
	done = false;
	/** It stopped counting (its control went away or was covered): letting go does nothing. */
	cancelled = false;

	/** `start`: when the button was pressed (ms, the same clock as `now` below). */
	constructor(
		private readonly start: number,
		private readonly length: number = HOLD_TIME
	) {}

	/** How far it has got, 0..1: what the ring around the button shows. 0 once cancelled. */
	progress(now: number): number {
		if (this.cancelled) return 0;
		if (this.done) return 1;
		return Math.min(1, Math.max(0, (now - this.start) / this.length));
	}

	/** Each frame while the button is down: true on the one frame it completes. */
	update(now: number): boolean {
		if (this.done || this.cancelled || now - this.start < this.length) return false;
		this.done = true;
		return true;
	}

	/** Its control is gone: it can't complete, and letting go isn't a quick press either. */
	cancel(): void {
		if (!this.done) this.cancelled = true;
	}

	/** The button was let go. True if that was a quick press: before it completed, not cancelled. */
	release(): boolean {
		return !this.done && !this.cancelled;
	}
}
