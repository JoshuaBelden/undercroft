/**
 * The audio manager: one Web Audio graph that every sound in a game plays through.
 *
 * - Each sound plays on a **category bus** (a `GainNode` per category the game names, such as
 *   music, ambience, sfx). Every bus feeds the **master** bus.
 * - **World** categories (every one not listed as `dry`) also pass through a low-pass filter
 *   (`setMuffle`) and send to a convolution reverb (`setReverb`). Dry categories (music,
 *   interface sounds) skip both and feed master directly.
 * - **Positional** sounds (`playBufferAt`) go through an HRTF `PannerNode`, placed in 3D around
 *   the listener (`setListener`).
 * - After master, an **output stage** applies the mono downmix and background muting
 *   (`AudioConfig.options`, re-read by `applyAudioOptions`).
 */

/** Low-pass cutoff (Hz) with no muffle: above human hearing, so the filter changes nothing. */
const OPEN_FREQUENCY = 20000;
/** Low-pass cutoff (Hz) at full muffle. */
const MUFFLED_FREQUENCY = 500;
/** Wet (reverb) level at reverb amount 1. */
const MAX_REVERB = 0.9;
/** Length (s) of the computed reverb impulse response. */
const IMPULSE_SECONDS = 2.8;
/** Positional falloff: full volume within the reference distance (m)... */
const REF_DISTANCE = 1.5;
/** ...and no quieter beyond the maximum distance (m). */
const MAX_DISTANCE = 60;

/** The name of the bus every category feeds. Its volume scales everything. */
export const MASTER = 'master';
/** The master bus's name, as a type. */
export type Master = typeof MASTER;

/** The output stage's options. Read each time they are applied (`applyAudioOptions`). */
export interface OutputOptions {
	/** Mix down to one channel, played on both speakers. */
	mono: boolean;
	/** Silence the output while the page is hidden or its window is unfocused. */
	muteInBackground: boolean;
}

/**
 * How an `AudioManager` is set up.
 * @typeParam C - The game's category names, not including `'master'`.
 */
export interface AudioConfig<C extends string> {
	/** The category buses, besides master. At least one. */
	categories: readonly C[];
	/** Categories that skip the world chain (muffle and reverb), such as music or interface sounds. */
	dry?: readonly C[];
	/** The bus a sound plays on when it names none. Defaults to the first category. */
	defaultCategory?: C;
	/** Starting linear gain (0..1) of every bus, master included. */
	volumes: Record<C | Master, number>;
	/** Returns the current output options. Without it, output is stereo and never muted. */
	options?: () => OutputOptions;
}

/** How one sound plays. */
export interface PlayOptions<C extends string = string> {
	/** The bus it plays on. Defaults to `AudioConfig.defaultCategory`. */
	category?: C;
	/** Linear gain for this sound (1 = as recorded). */
	volume?: number;
	/** Loop until stopped. */
	loop?: boolean;
	/**
	 * With `loop`: the second each pass after the first returns to, so an opening plays once.
	 * Left out, the whole buffer loops.
	 */
	loopStart?: number;
	/** Playback rate (1 = normal). Changes speed and pitch together. */
	rate?: number;
}

/** How one positional sound plays. */
export interface PositionalOptions<C extends string = string> extends PlayOptions<C> {
	/** Distance (m) within which it plays at full volume, before falling off. Default 1.5. */
	refDistance?: number;
}

/** A playing sound that can be changed or stopped while it plays. */
export interface SoundHandle {
	/**
	 * Ease the sound's gain to a new value.
	 * @param value - Target linear gain.
	 * @param seconds - About how long the ease takes (default 0.15). Longer makes a fade.
	 */
	setVolume(value: number, seconds?: number): void;
	/**
	 * Change the playback rate (speed and pitch together).
	 * @param value - Target rate, 1 = normal.
	 */
	setRate(value: number): void;
	/** Stop the sound and disconnect it from the graph. A stopped sound can't be restarted. */
	stop(): void;
}

/** A point or direction in world space: `[x, y, z]`, with +Y up. */
export type Vec3 = [number, number, number];

const STEREO: OutputOptions = { mono: false, muteInBackground: false };

/** Every manager with a live context, so an options change reaches them all. */
const live = new Set<{ applyOptions(): void }>();

/** The page is out of sight: its tab hidden or its window not focused. */
function inBackground(): boolean {
	return typeof document !== 'undefined' && (document.hidden || !document.hasFocus());
}

/**
 * Make every live `AudioManager` re-read its output options (mono, background muting). Call it
 * after the settings behind `AudioConfig.options` change. Focus and visibility changes call it
 * already.
 */
export function applyAudioOptions(): void {
	for (const manager of live) manager.applyOptions();
}

if (typeof window !== 'undefined') {
	for (const event of ['blur', 'focus'] as const) window.addEventListener(event, applyAudioOptions);
	document.addEventListener('visibilitychange', applyAudioOptions);
}

/**
 * Owns a game's Web Audio graph and plays decoded buffers on its category buses.
 *
 * Nothing is created until first use, and browsers keep audio suspended until a user gesture:
 * call `unlock()` from one.
 *
 * @typeParam C - The game's category names, not including `'master'`.
 * @example
 * const audio = new AudioManager({
 *   categories: ['music', 'sfx'],
 *   dry: ['music'],
 *   volumes: { master: 1, music: 0.7, sfx: 1 }
 * });
 * button.onclick = () => audio.unlock();
 * audio.playBufferAt(await audio.load('/door.webm'), [2, 0, -3], { category: 'sfx' });
 */
export class AudioManager<C extends string = string> {
	private context: AudioContext | null = null;
	/** Silenced while in the background (with the option). */
	private output: GainNode | null = null;
	/** Mixes down to one channel with the mono option; both speakers then play it. */
	private downmix: GainNode | null = null;
	private buses = new Map<C | Master, GainNode>();
	private muffler: BiquadFilterNode | null = null;
	private reverbSend: GainNode | null = null;
	private buffers = new Map<string, Promise<AudioBuffer>>();
	private volumes: Record<C | Master, number>;
	private listenerPosition: Vec3 = [0, 0, 0];
	private listenerForward: Vec3 = [0, 0, -1];
	private readonly categories: readonly C[];
	private readonly dry: ReadonlySet<C>;
	private readonly defaultCategory: C;
	private readonly options: () => OutputOptions;

	/**
	 * @param config - The categories, which are dry, starting volumes and output options.
	 * @throws If `config.categories` is empty.
	 */
	constructor(config: AudioConfig<C>) {
		const first = config.categories[0];
		if (first === undefined) throw new Error('AudioManager needs at least one category');
		this.categories = [...config.categories];
		this.dry = new Set(config.dry ?? []);
		this.defaultCategory = config.defaultCategory ?? first;
		this.volumes = { ...config.volumes };
		this.options = config.options ?? (() => STEREO);
	}

	/**
	 * Create the audio graph if needed and resume the context. Browsers' autoplay policy keeps a
	 * page's audio suspended until a user gesture, so call this from a click, tap or key press.
	 * @returns Resolves once audio is running.
	 */
	async unlock(): Promise<void> {
		const context = this.ensureContext();
		if (context.state === 'suspended') await context.resume();
	}

	/**
	 * Set a bus's volume at once.
	 * @param category - A category, or `'master'`.
	 * @param value - Linear gain, 0..1.
	 */
	setVolume(category: C | Master, value: number): void {
		this.volumes[category] = value;
		const bus = this.buses.get(category);
		if (bus) bus.gain.value = value;
	}

	/**
	 * Fetch and decode an audio file. Each URL is fetched once; later calls share the result.
	 * @param url - Any format the browser decodes (Opus in WebM, MP3, WAV...).
	 * @returns The decoded buffer.
	 */
	load(url: string): Promise<AudioBuffer> {
		let pending = this.buffers.get(url);
		if (!pending) {
			const context = this.ensureContext();
			pending = fetch(url)
				.then((response) => response.arrayBuffer())
				.then((data) => context.decodeAudioData(data));
			this.buffers.set(url, pending);
		}
		return pending;
	}

	/**
	 * Load a file (if it isn't already) and play it.
	 * @param url - The file to play.
	 * @param options - Category, volume, looping, rate.
	 * @returns A handle to change or stop it.
	 */
	async play(url: string, options: PlayOptions<C> = {}): Promise<SoundHandle> {
		return this.playBuffer(await this.load(url), options);
	}

	/**
	 * Play a decoded buffer on a category bus, not placed in the world.
	 * @param buffer - From `load`, or any `AudioBuffer`.
	 * @param options - Category, volume, looping, rate.
	 * @returns A handle to change or stop it.
	 */
	playBuffer(buffer: AudioBuffer, options: PlayOptions<C> = {}): SoundHandle {
		return this.start(buffer, options, null);
	}

	/**
	 * Play a decoded buffer from a point in the world: HRTF panning around the listener and
	 * inverse distance falloff.
	 * @param buffer - From `load`, or any `AudioBuffer`.
	 * @param position - Where it comes from, in world space.
	 * @param options - As `playBuffer`, plus `refDistance`.
	 * @returns A handle to change or stop it.
	 */
	playBufferAt(
		buffer: AudioBuffer,
		position: Vec3,
		options: PositionalOptions<C> = {}
	): SoundHandle {
		const context = this.ensureContext();
		const panner = context.createPanner();
		panner.panningModel = 'HRTF';
		panner.distanceModel = 'inverse';
		panner.refDistance = options.refDistance ?? REF_DISTANCE;
		panner.rolloffFactor = 1;
		panner.maxDistance = MAX_DISTANCE;
		setParam(panner.positionX, position[0], () => panner.setPosition(...position));
		setParam(panner.positionY, position[1]);
		setParam(panner.positionZ, position[2]);
		return this.start(buffer, options, panner);
	}

	/**
	 * Place the listener (usually the camera). Call it every frame.
	 * @param position - Where the listener is.
	 * @param forward - The direction it faces (+Y is up; looking along -Z is the default).
	 */
	setListener(position: Vec3, forward: Vec3): void {
		this.listenerPosition = position;
		this.listenerForward = forward;
		if (!this.context) return;
		const l = this.context.listener;
		if (l.positionX) {
			const t = this.context.currentTime;
			l.positionX.setValueAtTime(position[0], t);
			l.positionY.setValueAtTime(position[1], t);
			l.positionZ.setValueAtTime(position[2], t);
			l.forwardX.setValueAtTime(forward[0], t);
			l.forwardY.setValueAtTime(forward[1], t);
			l.forwardZ.setValueAtTime(forward[2], t);
			l.upX.setValueAtTime(0, t);
			l.upY.setValueAtTime(1, t);
			l.upZ.setValueAtTime(0, t);
		} else {
			// Older engines (Firefox) only have the deprecated setters.
			l.setPosition(...position);
			l.setOrientation(forward[0], forward[1], forward[2], 0, 1, 0);
		}
	}

	/** Where the listener is and which way it faces, as last set by `setListener`. */
	get listener(): { position: Vec3; forward: Vec3 } {
		return { position: this.listenerPosition, forward: this.listenerForward };
	}

	/**
	 * The distance falloff a positional sound gets, as a number: the same inverse curve the
	 * panner applies.
	 * @param position - Where the sound would be.
	 * @param refDistance - Its reference distance (default 1.5 m).
	 * @returns Gain from 0 to 1: 1 within `refDistance`, `refDistance / distance` beyond it.
	 */
	distanceGain(position: Vec3, refDistance = REF_DISTANCE): number {
		const [lx, ly, lz] = this.listenerPosition;
		const d = Math.hypot(position[0] - lx, position[1] - ly, position[2] - lz);
		return refDistance / Math.max(refDistance, Math.min(d, MAX_DISTANCE));
	}

	/** The Web Audio context, created on first use. Build your own nodes on it. */
	get audioContext(): AudioContext {
		return this.ensureContext();
	}

	/** Whether the context is running (after `unlock`, while the browser allows). */
	get unlocked(): boolean {
		return this.context?.state === 'running';
	}

	/**
	 * Muffle world sounds by lowering the low-pass filter's cutoff, swept on a log scale from
	 * 20 kHz (0) to 500 Hz (1). Eases over about 0.25 s.
	 * @param amount - 0 = clear, 1 = fully muffled (underwater).
	 */
	setMuffle(amount: number): void {
		if (!this.context || !this.muffler) return;
		const a = Math.max(0, Math.min(1, amount));
		// Interpolate on a log scale so the sweep sounds even.
		const frequency = OPEN_FREQUENCY * Math.pow(MUFFLED_FREQUENCY / OPEN_FREQUENCY, a);
		this.muffler.frequency.setTargetAtTime(frequency, this.context.currentTime, 0.08);
	}

	/**
	 * Set how much world sound is sent to the reverb (the wet level, up to 0.9). Eases over
	 * about 1 s.
	 * @param amount - 0 = dry (a tight space), 1 = vast.
	 */
	setReverb(amount: number): void {
		if (!this.context || !this.reverbSend) return;
		const wet = Math.max(0, Math.min(1, amount)) * MAX_REVERB;
		this.reverbSend.gain.setTargetAtTime(wet, this.context.currentTime, 0.3);
	}

	/** Re-read this manager's output options (mono, background muting) and apply them. */
	applyOptions(): void {
		const { context, output, downmix } = this;
		if (!context || !output || !downmix) return;
		const { mono, muteInBackground } = this.options();
		downmix.channelCount = mono ? 1 : 2;
		downmix.channelCountMode = mono ? 'explicit' : 'max';
		const muted = muteInBackground && inBackground();
		output.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.05);
	}

	/** Close the audio context and forget every loaded buffer. The manager can't be used after. */
	dispose(): void {
		live.delete(this);
		void this.context?.close();
		this.context = null;
		this.output = null;
		this.downmix = null;
		this.buses.clear();
		this.muffler = null;
		this.reverbSend = null;
		this.buffers.clear();
	}

	private start(
		buffer: AudioBuffer,
		options: PlayOptions<C>,
		panner: PannerNode | null
	): SoundHandle {
		const context = this.ensureContext();
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = options.loop ?? false;
		if (source.loop && options.loopStart) {
			source.loopStart = options.loopStart;
			source.loopEnd = buffer.duration;
		}
		source.playbackRate.value = options.rate ?? 1;
		const gain = context.createGain();
		gain.gain.value = options.volume ?? 1;
		const bus = this.bus(options.category ?? this.defaultCategory);
		if (panner) source.connect(gain).connect(panner).connect(bus);
		else source.connect(gain).connect(bus);
		source.start();
		const ramp = 0.05;
		return {
			// setTargetAtTime's time constant gets about 95% of the way in three of them.
			setVolume: (value, seconds = ramp * 3) =>
				gain.gain.setTargetAtTime(value, context.currentTime, seconds / 3),
			setRate: (value) => source.playbackRate.setTargetAtTime(value, context.currentTime, ramp),
			stop: () => {
				source.stop();
				source.disconnect();
			}
		};
	}

	private ensureContext(): AudioContext {
		if (!this.context) {
			const context = new AudioContext();
			this.context = context;
			const master = context.createGain();
			master.gain.value = this.volumes.master;
			this.output = context.createGain();
			this.downmix = context.createGain();
			this.downmix.channelInterpretation = 'speakers';
			master.connect(this.output).connect(this.downmix).connect(context.destination);
			live.add(this);
			this.applyOptions();
			this.buses.set(MASTER, master);
			// World sounds go through the muffler, and also send to the reverb. Dry ones bypass both.
			this.muffler = context.createBiquadFilter();
			this.muffler.type = 'lowpass';
			this.muffler.frequency.value = OPEN_FREQUENCY;
			this.muffler.connect(master);
			const convolver = context.createConvolver();
			convolver.buffer = impulse(context);
			this.reverbSend = context.createGain();
			this.reverbSend.gain.value = 0;
			this.reverbSend.connect(convolver).connect(this.muffler);
			for (const category of this.categories) {
				const bus = context.createGain();
				bus.gain.value = this.volumes[category];
				if (this.dry.has(category)) {
					bus.connect(master);
				} else {
					bus.connect(this.muffler);
					bus.connect(this.reverbSend);
				}
				this.buses.set(category, bus);
			}
		}
		return this.context;
	}

	private bus(category: C | Master): GainNode {
		this.ensureContext();
		return this.buses.get(category) as GainNode;
	}
}

/**
 * The reverb's impulse response, computed: stereo noise under an exponential decay (a stone
 * room's diffuse tail). It shapes how the reverb rings; it is never heard on its own.
 */
function impulse(context: BaseAudioContext): AudioBuffer {
	const length = Math.floor(context.sampleRate * IMPULSE_SECONDS);
	const buffer = context.createBuffer(2, length, context.sampleRate);
	let seed = 12345;
	const rand = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return (seed / 4294967296) * 2 - 1;
	};
	for (let channel = 0; channel < 2; channel++) {
		const data = buffer.getChannelData(channel);
		for (let i = 0; i < length; i++) {
			const t = i / context.sampleRate;
			// The first 80 ms is quieter, so the dry sound stays clear ahead of the tail. exp(-2.4 t)
			// falls by 60 dB in about 2.9 s: the reverb's RT60.
			data[i] = rand() * Math.exp(-t * 2.4) * (t < 0.08 ? 0.6 : 1);
		}
	}
	return buffer;
}

/** Set an AudioParam if the engine has it, else call a legacy fallback. */
function setParam(param: AudioParam | undefined, value: number, fallback?: () => void): void {
	if (param) param.value = value;
	else fallback?.();
}
