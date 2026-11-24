import type { CaptionCue as WickCaptionCue } from '@wick/audio';
import type { SoundId } from '#lib/content/audio/sounds.ts';

/**
 * Sound captions: what the player would have heard, as text. `SoundBank` raises a cue for every
 * audible sound that has a `caption` in the sound registry; the feed holds the few most recent
 * for the HUD (`Captions.svelte`). Which way a cue came from is WICK's (`captionDirection`).
 * See docs/dev/player.md (Audio).
 */

export { captionDirection, type CaptionDirection } from '@wick/audio';

export type CaptionCue = WickCaptionCue<SoundId>;

export interface Caption extends CaptionCue {
	/** Seconds (performance clock) at which it leaves the screen. */
	expires: number;
}

/** Seconds a caption stays up after its sound last played. */
const CAPTION_SECONDS = 2.5;
const MAX_CAPTIONS = 4;

export class CaptionFeed {
	list = $state<Caption[]>([]);

	/** Show a caption, or keep it up (and re-aim it) if that sound is already showing. */
	push(cue: CaptionCue): void {
		const expires = performance.now() / 1000 + CAPTION_SECONDS;
		const showing = this.list.find((caption) => caption.id === cue.id);
		if (showing) {
			showing.direction = cue.direction;
			showing.expires = expires;
			return;
		}
		if (this.list.length >= MAX_CAPTIONS) this.list.shift();
		this.list.push({ ...cue, expires });
	}

	/** Drop captions whose time is up; call every frame. */
	update(): void {
		if (!this.list.length) return;
		const now = performance.now() / 1000;
		if (this.list.some((caption) => caption.expires <= now)) {
			this.list = this.list.filter((caption) => caption.expires > now);
		}
	}

	clear(): void {
		if (this.list.length) this.list = [];
	}
}
