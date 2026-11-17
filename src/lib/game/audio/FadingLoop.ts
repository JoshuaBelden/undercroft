import type { SoundId } from '#lib/content/audio/sounds.ts';
import type { SoundHandle } from './AudioManager.ts';
import type { SoundBank } from './SoundBank.ts';

export interface Fades {
	/** Seconds to come up when it starts or is wanted again. */
	in: number;
	/** Seconds to go quiet when it is no longer wanted; then it stops. */
	out: number;
}

/**
 * A looped sound that fades in while it is wanted and fades out, then stops, when it isn't: the
 * ambient bed on the surface (the root layout), the fight music underground (`play/affliction`).
 * See docs/dev/player.md#fading-loops.
 *
 * It waits for `allow()` before it starts: until the browser lets the page make sound.
 */
export class FadingLoop {
	private handle: SoundHandle | null = null;
	private wanted = false;
	private allowed = false;
	/** Bumped on every change, so a loop that finished loading late knows it isn't wanted. */
	private generation = 0;
	private stopTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly sounds: SoundBank,
		private readonly id: SoundId,
		private readonly fades: Fades
	) {}

	/** Should it be playing. Setting it to what it already is changes nothing. */
	setWanted(wanted: boolean): void {
		if (wanted === this.wanted) return;
		this.wanted = wanted;
		this.update();
	}

	/** The audio is unlocked: it can start. */
	allow(): void {
		if (this.allowed) return;
		this.allowed = true;
		this.update();
	}

	/** Stop at once, without a fade. */
	dispose(): void {
		this.generation++;
		this.wanted = false;
		this.clearStop();
		this.handle?.stop();
		this.handle = null;
	}

	private update(): void {
		const generation = ++this.generation;
		if (this.wanted && this.allowed) {
			this.clearStop();
			if (this.handle) {
				this.handle.setVolume(1, this.fades.in);
				return;
			}
			void this.sounds.loop(this.id, 0).then((handle) => {
				// No longer wanted (or wanted again, with another load) while it loaded.
				if (generation !== this.generation || this.handle) {
					handle.stop();
					return;
				}
				this.handle = handle;
				handle.setVolume(1, this.fades.in);
			});
			return;
		}
		if (!this.handle || this.stopTimer) return;
		this.handle.setVolume(0, this.fades.out);
		this.stopTimer = setTimeout(() => {
			this.stopTimer = null;
			this.handle?.stop();
			this.handle = null;
		}, this.fades.out * 1000);
	}

	private clearStop(): void {
		if (!this.stopTimer) return;
		clearTimeout(this.stopTimer);
		this.stopTimer = null;
	}
}
