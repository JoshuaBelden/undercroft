import type { SoundHandle } from './AudioManager.ts';

/**
 * What a fading loop plays through: a `SoundBank`, or anything that starts loops by id.
 * @typeParam Id - The sound ids.
 */
export interface LoopSource<Id extends string> {
	/**
	 * Start a loop.
	 * @param id - The sound.
	 * @param volume - Its starting volume.
	 * @returns A handle to fade and stop it.
	 */
	loop(id: Id, volume?: number): Promise<SoundHandle>;
}

/** How long a fading loop's fades take. */
export interface Fades {
	/** Seconds to come up when it starts or is wanted again. */
	in: number;
	/** Seconds to go quiet when it is no longer wanted; then it stops. */
	out: number;
}

/**
 * A looped sound that fades in while it is wanted, and fades out then stops when it isn't: an
 * ambient bed under the menus, the music of a fight. Set whether it is wanted as often as you
 * like; only a change does anything.
 *
 * It waits for `allow()` before it starts: until the browser lets the page make sound.
 *
 * @typeParam Id - The sound ids.
 * @example
 * const bed = new FadingLoop(sounds, 'menu.bed', { in: 3, out: 1.5 });
 * startButton.onclick = async () => { await audio.unlock(); bed.allow(); };
 * bed.setWanted(onMenus);
 */
export class FadingLoop<Id extends string = string> {
	private handle: SoundHandle | null = null;
	private wanted = false;
	private allowed = false;
	/** Bumped on every change, so a loop that finished loading late knows it isn't wanted. */
	private generation = 0;
	private stopTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * @param sounds - What starts the loop (usually a `SoundBank`).
	 * @param id - The sound to loop.
	 * @param fades - How long fading in and out take.
	 */
	constructor(
		private readonly sounds: LoopSource<Id>,
		private readonly id: Id,
		private readonly fades: Fades
	) {}

	/**
	 * Say whether it should be playing. Wanted, it starts (once allowed) or comes back up
	 * mid-fade without restarting; unwanted, it fades out, then stops.
	 * @param wanted - Whether it should be playing. The same value again changes nothing.
	 */
	setWanted(wanted: boolean): void {
		if (wanted === this.wanted) return;
		this.wanted = wanted;
		this.update();
	}

	/** Audio may play now (it has been unlocked): if it is wanted, it starts. */
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
