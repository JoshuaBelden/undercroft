import { AUDIO_FILES, AUDIO_LOOP_STARTS } from '#lib/content/audio/files.generated.ts';
import { SOUNDS, type SoundDef, type SoundId } from '#lib/content/audio/sounds.ts';
import type { AudioManager, SoundHandle } from './AudioManager.ts';
import { captionDirection, type CaptionCue } from './captions.svelte.ts';

type Vec3 = [number, number, number];

/** Quieter than this (0..1, after distance falloff) a sound isn't captioned. */
const CAPTION_THRESHOLD = 0.04;
/** Seconds between caption refreshes for a loop that stays audible. */
const LOOP_CAPTION_INTERVAL = 0.5;

/** The handle of a loop with no recording: it plays nothing. */
const SILENT: SoundHandle = { setVolume: () => {}, setRate: () => {}, stop: () => {} };

/**
 * Plays registered sounds by id (see src/lib/content/audio/sounds.ts). Each sound resolves to its
 * built recording variants and plays through the AudioManager's category buses. A sound with no
 * recording built plays nothing (the admin Art & Assets page lists it as missing); a loop of one
 * hands back a silent handle, so callers needn't know.
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

	/** The built files of a sound, its variants in order (none if it isn't recorded yet). */
	private urls(id: SoundId): string[] {
		const def: SoundDef = SOUNDS[id];
		const ids = def.file === undefined ? [] : Array.isArray(def.file) ? def.file : [def.file];
		return ids.flatMap((fileId) => AUDIO_FILES[fileId] ?? []);
	}

	private buffers(id: SoundId): Promise<AudioBuffer[]> {
		let pending = this.variants.get(id);
		if (!pending) {
			pending = Promise.all(this.urls(id).map((url) => this.audio.load(url)));
			this.variants.set(id, pending);
		}
		return pending;
	}

	/** A random variant, or undefined for a sound with no recording (it plays nothing). */
	private pick(buffers: AudioBuffer[]): AudioBuffer | undefined {
		return buffers[Math.floor(Math.random() * buffers.length)];
	}

	/** Fire-and-forget one-shot. `volume` multiplies the sound's own volume. */
	play(id: SoundId, volume = 1): void {
		this.cue(id, volume, null);
		if (!this.audio.unlocked) return;
		const def: SoundDef = SOUNDS[id];
		const spread = def.variation ?? 0;
		void this.buffers(id).then((buffers) => {
			const buffer = this.pick(buffers);
			if (!buffer) return;
			this.audio.playBuffer(buffer, {
				category: def.category,
				volume: def.volume * volume,
				rate: (def.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread)
			});
		});
	}

	/** One-shot from a point in the world (3D panned, quieter with distance). */
	playAt(id: SoundId, position: Vec3, volume = 1, refDistance?: number): void {
		this.cue(id, volume, position, refDistance);
		if (!this.audio.unlocked) return;
		const def: SoundDef = SOUNDS[id];
		const spread = def.variation ?? 0;
		void this.buffers(id).then((buffers) => {
			const buffer = this.pick(buffers);
			if (!buffer) return;
			this.audio.playBufferAt(buffer, position, {
				category: def.category,
				volume: def.volume * volume,
				rate: (def.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread),
				refDistance
			});
		});
	}

	/**
	 * A one-shot from a point in the world, as `playAt`, that can be cut short: the handle (null if
	 * audio is locked, the sound isn't recorded or won't load). For work that can be given up
	 * halfway (prying).
	 */
	async playAtHeld(
		id: SoundId,
		position: Vec3,
		volume = 1,
		refDistance?: number
	): Promise<SoundHandle | null> {
		this.cue(id, volume, position, refDistance);
		if (!this.audio.unlocked) return null;
		const def: SoundDef = SOUNDS[id];
		const spread = def.variation ?? 0;
		try {
			const buffer = this.pick(await this.buffers(id));
			if (!buffer) return null;
			return this.audio.playBufferAt(buffer, position, {
				category: def.category,
				volume: def.volume * volume,
				rate: (def.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread),
				refDistance
			});
		} catch {
			return null;
		}
	}

	/**
	 * Start a looping sound (first variant); adjust or stop it through the handle. A file built
	 * to keep its opening (loopFrom) plays from its start once, then loops from where it says. A
	 * sound with no recording gives a silent handle (still captioned while "audible").
	 */
	async loop(id: SoundId, volume = 0): Promise<SoundHandle> {
		const def: SoundDef = SOUNDS[id];
		const [buffer] = await this.buffers(id);
		const [url] = this.urls(id);
		const handle: SoundHandle = buffer
			? this.audio.playBuffer(buffer, {
					category: def.category,
					volume: volume * def.volume,
					rate: def.rate ?? 1,
					loop: true,
					loopStart: url === undefined ? undefined : AUDIO_LOOP_STARTS[url]
				})
			: SILENT;
		return {
			setVolume: (value, seconds) => {
				handle.setVolume(value * def.volume, seconds);
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
