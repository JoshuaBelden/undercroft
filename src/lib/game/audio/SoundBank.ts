import { AUDIO_FILES } from '#lib/content/audio/files.generated.ts';
import { SOUNDS, type SoundDef, type SoundId } from '#lib/content/audio/sounds.ts';
import type { AudioManager, SoundHandle } from './AudioManager.ts';
import { captionDirection, type CaptionCue } from './captions.svelte.ts';
import { synthesize } from './synth.ts';

type Vec3 = [number, number, number];

/** Quieter than this (0..1, after distance falloff) a sound isn't captioned. */
const CAPTION_THRESHOLD = 0.04;
/** Seconds between caption refreshes for a loop that stays audible. */
const LOOP_CAPTION_INTERVAL = 0.5;

/**
 * Plays registered sounds by id (see src/lib/content/audio/sounds.ts). Each sound resolves to its
 * built recording variants, or to its synthesized placeholder if none are built, and plays
 * through the AudioManager's category buses.
 *
 * Every audible sound that has a `caption` also raises a cue on `oncaption`, whether or not
 * audio is running, so captions work with the sound off.
 */
export class SoundBank {
	private variants = new Map<SoundId, Promise<AudioBuffer[]>>();

	/** Receives a cue for each captioned sound the listener could hear. */
	oncaption: ((cue: CaptionCue) => void) | null = null;
	/** Loop id -> when its caption was last raised (performance clock, seconds). */
	private loopCaptions = new Map<SoundId, number>();

	constructor(private audio: AudioManager) {}

	/** Raise a caption for a sound at `level` (0..1 before distance), if it is loud enough to hear. */
	private cue(id: SoundId, level: number, position: Vec3 | null, refDistance?: number): void {
		const def: SoundDef = SOUNDS[id];
		if (!this.oncaption || !def.caption) return;
		if (!position && def.captionOthers) return;
		const falloff = position ? this.audio.distanceGain(position, refDistance) : 1;
		if (level * def.volume * falloff < CAPTION_THRESHOLD) return;
		const listener = this.audio.listener;
		this.oncaption({
			id,
			text: def.caption,
			direction: position ? captionDirection(listener.position, listener.forward, position) : null
		});
	}

	private buffers(id: SoundId): Promise<AudioBuffer[]> {
		let pending = this.variants.get(id);
		if (!pending) {
			const def: SoundDef = SOUNDS[id];
			const ids = def.file === undefined ? [] : Array.isArray(def.file) ? def.file : [def.file];
			const urls = ids.flatMap((fileId) => AUDIO_FILES[fileId] ?? []);
			if (urls.length) pending = Promise.all(urls.map((url) => this.audio.load(url)));
			else if (def.synth)
				pending = Promise.resolve([synthesize(this.audio.audioContext, def.synth)]);
			else pending = Promise.reject(new Error(`Sound "${id}" has no built file or synth`));
			this.variants.set(id, pending);
		}
		return pending;
	}

	/** Fire-and-forget one-shot. `volume` multiplies the sound's own volume. */
	play(id: SoundId, volume = 1): void {
		this.cue(id, volume, null);
		if (!this.audio.unlocked) return;
		const def: SoundDef = SOUNDS[id];
		const spread = def.variation ?? 0;
		void this.buffers(id).then((buffers) =>
			this.audio.playBuffer(buffers[Math.floor(Math.random() * buffers.length)], {
				category: def.category,
				volume: def.volume * volume,
				rate: (def.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread)
			})
		);
	}

	/** One-shot from a point in the world (3D panned, quieter with distance). */
	playAt(id: SoundId, position: Vec3, volume = 1, refDistance?: number): void {
		this.cue(id, volume, position, refDistance);
		if (!this.audio.unlocked) return;
		const def: SoundDef = SOUNDS[id];
		const spread = def.variation ?? 0;
		void this.buffers(id).then((buffers) =>
			this.audio.playBufferAt(buffers[Math.floor(Math.random() * buffers.length)], position, {
				category: def.category,
				volume: def.volume * volume,
				rate: (def.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread),
				refDistance
			})
		);
	}

	/** Start a looping sound (first variant); adjust or stop it through the handle. */
	async loop(id: SoundId, volume = 0): Promise<SoundHandle> {
		const def: SoundDef = SOUNDS[id];
		const [buffer] = await this.buffers(id);
		const handle = this.audio.playBuffer(buffer, {
			category: def.category,
			volume: volume * def.volume,
			rate: def.rate ?? 1,
			loop: true
		});
		return {
			setVolume: (value) => {
				handle.setVolume(value * def.volume);
				// A loop is captioned for as long as it stays audible.
				const now = performance.now() / 1000;
				if (now - (this.loopCaptions.get(id) ?? 0) >= LOOP_CAPTION_INTERVAL) {
					this.loopCaptions.set(id, now);
					this.cue(id, value, null);
				}
			},
			setRate: (value) => handle.setRate(value * (def.rate ?? 1)),
			stop: () => handle.stop()
		};
	}
}
