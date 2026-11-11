import type { SoundId } from '#lib/content/audio/sounds.ts';

/**
 * Sound captions: what the player would have heard, as text. `SoundBank` raises a cue for every
 * audible sound that has a `caption` in the sound registry; the feed holds the few most recent
 * for the HUD (`Captions.svelte`). See docs/dev/player.md (Audio).
 */

type Vec3 = [number, number, number];

export type CaptionDirection = 'ahead' | 'behind' | 'left' | 'right' | 'above' | 'below';

export interface CaptionCue {
	id: SoundId;
	text: string;
	/** Where it came from relative to the view; null for sounds with no source in the world. */
	direction: CaptionDirection | null;
}

export interface Caption extends CaptionCue {
	/** Seconds (performance clock) at which it leaves the screen. */
	expires: number;
}

/** Seconds a caption stays up after its sound last played. */
const CAPTION_SECONDS = 2.5;
const MAX_CAPTIONS = 4;
/** Closer than this (m) a sound has no useful direction. */
const NEAR = 0.75;
/** A source is above or below when it is this much higher or lower (m) and steeper than 45 degrees. */
const VERTICAL = 2;

/** Which way a sound at `source` lies for a listener at `position` facing `forward`. */
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
