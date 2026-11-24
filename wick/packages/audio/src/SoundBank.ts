import type { AudioManager, SoundHandle, Vec3 } from './AudioManager.ts';
import { captionDirection, type CaptionCue } from './captions.ts';

/**
 * One registered sound: which recording it plays and how. A sound with no `file`, or whose files
 * have no URLs in the catalog, plays nothing until they do.
 * @typeParam C - The game's category names.
 */
export interface SoundDef<C extends string = string> {
	/** Recording id(s), keys of `SoundCatalog.files`. A random variant of all of them plays each time. */
	file?: string | string[];
	/** The bus it plays on. */
	category: C;
	/** Its linear gain (1 = as recorded). Every play multiplies this. */
	volume: number;
	/** Base playback rate (1 = normal). Shifts pitch, so one recording can serve several sounds. */
	rate?: number;
	/** Random spread on the rate each play (0.1 = ±10%), so repeats don't sound identical. */
	variation?: number;
	/** Caption text, for players with captions on. Sounds without one are never captioned. */
	caption?: string;
	/** Caption it only when played from a point in the world (`playAt`), not when played flat. */
	captionOthers?: boolean;
}

/**
 * What a sound bank plays: the registry of sounds by id, and the URLs of their recordings.
 * @typeParam Id - The sound ids.
 * @typeParam C - The category names.
 */
export interface SoundCatalog<Id extends string, C extends string> {
	/** Every sound, by id. */
	sounds: Record<Id, SoundDef<C>>;
	/** Recording id -> variant URLs (one is picked at random each play). */
	files: Record<string, readonly string[]>;
	/** URL -> the second each pass after the first returns to, for loops that keep an opening. */
	loopStarts?: Record<string, number>;
}

/** Quieter than this (0..1, after distance falloff) a sound isn't captioned. */
const CAPTION_THRESHOLD = 0.04;
/** Seconds between caption refreshes for a loop that stays audible. */
const LOOP_CAPTION_INTERVAL = 0.5;

/** The handle of a loop with no recording: it plays nothing. */
const SILENT: SoundHandle = { setVolume: () => {}, setRate: () => {}, stop: () => {} };

/**
 * Plays sounds by id from a catalog, through an `AudioManager`'s category buses. Each sound's
 * recorded variants load once, on first play; one is picked at random each time.
 *
 * A sound with no recording plays nothing, and a loop of one gets a silent handle, so code can
 * name a sound before it is recorded. Every audible sound with a `caption` raises a cue on
 * `oncaption`, even while audio is locked, so captions work with the sound off.
 *
 * @typeParam Id - The sound ids (usually `keyof typeof SOUNDS`).
 * @typeParam C - The category names.
 * @example
 * const sounds = new SoundBank(audio, { sounds: SOUNDS, files: FILES });
 * sounds.play('door.open');
 * sounds.playAt('footstep', [x, y, z]);
 */
export class SoundBank<Id extends string = string, C extends string = string> {
	private variants = new Map<Id, Promise<AudioBuffer[]>>();

	/** Called with a cue for each captioned sound loud enough for the listener to hear. */
	oncaption: ((cue: CaptionCue<Id>) => void) | null = null;
	/** Loop id -> when its caption was last raised (performance clock, seconds). */
	private loopCaptions = new Map<Id, number>();

	/**
	 * @param audio - The manager it plays through.
	 * @param catalog - The sounds, their file URLs, and loop start points.
	 */
	constructor(
		private audio: AudioManager<C>,
		private catalog: SoundCatalog<Id, C>
	) {}

	/** Raise a caption for a sound at `level` (0..1 before distance), if it is loud enough to hear. */
	private cue(id: Id, level: number, position: Vec3 | null, refDistance?: number): void {
		const def = this.catalog.sounds[id];
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

	/** The URLs of a sound's recordings, its variants in order (none if it isn't recorded yet). */
	private urls(id: Id): string[] {
		const def = this.catalog.sounds[id];
		const ids = def.file === undefined ? [] : Array.isArray(def.file) ? def.file : [def.file];
		return ids.flatMap((fileId) => this.catalog.files[fileId] ?? []);
	}

	private buffers(id: Id): Promise<AudioBuffer[]> {
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

	/** Its playback rate this time: the base rate, varied by up to its spread. */
	private rate(def: SoundDef<C>): number {
		return (def.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (def.variation ?? 0));
	}

	/**
	 * Play a sound once, not placed in the world. Does nothing while audio is locked.
	 * @param id - The sound.
	 * @param volume - Multiplies the sound's own volume (default 1).
	 */
	play(id: Id, volume = 1): void {
		this.cue(id, volume, null);
		if (!this.audio.unlocked) return;
		const def = this.catalog.sounds[id];
		void this.buffers(id).then((buffers) => {
			const buffer = this.pick(buffers);
			if (!buffer) return;
			this.audio.playBuffer(buffer, {
				category: def.category,
				volume: def.volume * volume,
				rate: this.rate(def)
			});
		});
	}

	/**
	 * Play a sound once from a point in the world: panned around the listener, quieter with
	 * distance. Does nothing while audio is locked.
	 * @param id - The sound.
	 * @param position - Where it comes from.
	 * @param volume - Multiplies the sound's own volume (default 1).
	 * @param refDistance - Distance (m) within which it plays at full volume (default 1.5).
	 */
	playAt(id: Id, position: Vec3, volume = 1, refDistance?: number): void {
		this.cue(id, volume, position, refDistance);
		if (!this.audio.unlocked) return;
		const def = this.catalog.sounds[id];
		void this.buffers(id).then((buffers) => {
			const buffer = this.pick(buffers);
			if (!buffer) return;
			this.audio.playBufferAt(buffer, position, {
				category: def.category,
				volume: def.volume * volume,
				rate: this.rate(def),
				refDistance
			});
		});
	}

	/**
	 * As `playAt`, but resolves to a handle so the sound can be cut short (for an action that can
	 * be abandoned halfway).
	 * @param id - The sound.
	 * @param position - Where it comes from.
	 * @param volume - Multiplies the sound's own volume (default 1).
	 * @param refDistance - Distance (m) within which it plays at full volume (default 1.5).
	 * @returns The handle, or null if audio is locked, the sound isn't recorded, or it won't load.
	 */
	async playAtHeld(
		id: Id,
		position: Vec3,
		volume = 1,
		refDistance?: number
	): Promise<SoundHandle | null> {
		this.cue(id, volume, position, refDistance);
		if (!this.audio.unlocked) return null;
		const def = this.catalog.sounds[id];
		try {
			const buffer = this.pick(await this.buffers(id));
			if (!buffer) return null;
			return this.audio.playBufferAt(buffer, position, {
				category: def.category,
				volume: def.volume * volume,
				rate: this.rate(def),
				refDistance
			});
		} catch {
			return null;
		}
	}

	/**
	 * Start a sound looping (its first variant). A file listed in `loopStarts` plays from its
	 * start once, then loops from that point. While its volume keeps being set, its caption is
	 * raised again at most every 0.5 s.
	 * @param id - The sound.
	 * @param volume - Starting volume, multiplying the sound's own (default 0, to fade it up).
	 * @returns A handle; silent (but still captioned) if the sound isn't recorded.
	 */
	async loop(id: Id, volume = 0): Promise<SoundHandle> {
		const def = this.catalog.sounds[id];
		const [buffer] = await this.buffers(id);
		const [url] = this.urls(id);
		const handle: SoundHandle = buffer
			? this.audio.playBuffer(buffer, {
					category: def.category,
					volume: volume * def.volume,
					rate: def.rate ?? 1,
					loop: true,
					loopStart: url === undefined ? undefined : this.catalog.loopStarts?.[url]
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
