/**
 * All game audio routes through here. Each sound plays on a category bus whose
 * volume comes from player settings; every bus feeds the master bus.
 *
 * World sounds (sfx, ambience) also pass through:
 * - a low-pass "muffler" (underwater, tight spaces): `setMuffle`;
 * - a reverb send (the size of the space): `setReverb`.
 * Positional sounds (`playBufferAt`) are placed in 3D around the listener (`setListener`).
 * Voice is intentionally absent until voice chat is in scope.
 */

const OPEN_FREQUENCY = 20000;
const MUFFLED_FREQUENCY = 500;
/** Wet level at reverb amount 1. */
const MAX_REVERB = 0.9;
const IMPULSE_SECONDS = 2.8;
/** Positional falloff: full volume inside the reference distance, no quieter past the maximum. */
const REF_DISTANCE = 1.5;
const MAX_DISTANCE = 60;

export const AUDIO_CATEGORIES = ['master', 'music', 'ambience', 'sfx'] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export interface PlayOptions {
	category?: Exclude<AudioCategory, 'master'>;
	volume?: number;
	loop?: boolean;
	/** Playback rate (1 = normal); also shifts pitch. */
	rate?: number;
}

export interface PositionalOptions extends PlayOptions {
	/** Distance (m) at which the sound plays at full volume before falling off. */
	refDistance?: number;
}

/** A playing sound whose volume and rate can change while it plays (loops, breathing). */
export interface SoundHandle {
	setVolume(value: number): void;
	setRate(value: number): void;
	stop(): void;
}

type Vec3 = [number, number, number];

export class AudioManager {
	private context: AudioContext | null = null;
	private buses = new Map<AudioCategory, GainNode>();
	private muffler: BiquadFilterNode | null = null;
	private reverbSend: GainNode | null = null;
	private buffers = new Map<string, Promise<AudioBuffer>>();
	private volumes: Record<AudioCategory, number>;
	private listenerPosition: Vec3 = [0, 0, 0];
	private listenerForward: Vec3 = [0, 0, -1];

	constructor(volumes: Record<AudioCategory, number>) {
		this.volumes = { ...volumes };
	}

	/** Browsers require a user gesture before audio can start; call from one. */
	async unlock(): Promise<void> {
		const context = this.ensureContext();
		if (context.state === 'suspended') await context.resume();
	}

	setVolume(category: AudioCategory, value: number): void {
		this.volumes[category] = value;
		const bus = this.buses.get(category);
		if (bus) bus.gain.value = value;
	}

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

	async play(url: string, options: PlayOptions = {}): Promise<SoundHandle> {
		return this.playBuffer(await this.load(url), options);
	}

	/** Play an already-decoded or generated buffer on a category bus. */
	playBuffer(buffer: AudioBuffer, options: PlayOptions = {}): SoundHandle {
		return this.start(buffer, options, null);
	}

	/** Play a buffer from a point in the world (3D panning and distance falloff). */
	playBufferAt(buffer: AudioBuffer, position: Vec3, options: PositionalOptions = {}): SoundHandle {
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

	/** Place the listener (the camera): position and the direction it faces. */
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

	/** Where the listener is and which way it faces (as last set). */
	get listener(): { position: Vec3; forward: Vec3 } {
		return { position: this.listenerPosition, forward: this.listenerForward };
	}

	/** How loud (0..1) a positional sound at `position` is for the listener: the panner's falloff. */
	distanceGain(position: Vec3, refDistance = REF_DISTANCE): number {
		const [lx, ly, lz] = this.listenerPosition;
		const d = Math.hypot(position[0] - lx, position[1] - ly, position[2] - lz);
		return refDistance / Math.max(refDistance, Math.min(d, MAX_DISTANCE));
	}

	/** The Web Audio context (created on first use); synthesized sounds are built against it. */
	get audioContext(): AudioContext {
		return this.ensureContext();
	}

	get unlocked(): boolean {
		return this.context?.state === 'running';
	}

	/** Muffle world sounds: 0 = clear, 1 = fully muffled (underwater). */
	setMuffle(amount: number): void {
		if (!this.context || !this.muffler) return;
		const a = Math.max(0, Math.min(1, amount));
		// Interpolate on a log scale so the sweep sounds even.
		const frequency = OPEN_FREQUENCY * Math.pow(MUFFLED_FREQUENCY / OPEN_FREQUENCY, a);
		this.muffler.frequency.setTargetAtTime(frequency, this.context.currentTime, 0.08);
	}

	/** How much the space echoes: 0 = dry (tight), 1 = vast. */
	setReverb(amount: number): void {
		if (!this.context || !this.reverbSend) return;
		const wet = Math.max(0, Math.min(1, amount)) * MAX_REVERB;
		this.reverbSend.gain.setTargetAtTime(wet, this.context.currentTime, 0.3);
	}

	dispose(): void {
		void this.context?.close();
		this.context = null;
		this.buses.clear();
		this.muffler = null;
		this.reverbSend = null;
		this.buffers.clear();
	}

	private start(buffer: AudioBuffer, options: PlayOptions, panner: PannerNode | null): SoundHandle {
		const context = this.ensureContext();
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = options.loop ?? false;
		source.playbackRate.value = options.rate ?? 1;
		const gain = context.createGain();
		gain.gain.value = options.volume ?? 1;
		const bus = this.bus(options.category ?? 'sfx');
		if (panner) source.connect(gain).connect(panner).connect(bus);
		else source.connect(gain).connect(bus);
		source.start();
		const ramp = 0.05;
		return {
			setVolume: (value) => gain.gain.setTargetAtTime(value, context.currentTime, ramp),
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
			master.connect(context.destination);
			this.buses.set('master', master);
			// World sounds (sfx, ambience) go through the muffler, and also send to the reverb.
			// Music bypasses both.
			this.muffler = context.createBiquadFilter();
			this.muffler.type = 'lowpass';
			this.muffler.frequency.value = OPEN_FREQUENCY;
			this.muffler.connect(master);
			const convolver = context.createConvolver();
			convolver.buffer = impulse(context);
			this.reverbSend = context.createGain();
			this.reverbSend.gain.value = 0;
			this.reverbSend.connect(convolver).connect(this.muffler);
			for (const category of AUDIO_CATEGORIES) {
				if (category === 'master') continue;
				const bus = context.createGain();
				bus.gain.value = this.volumes[category];
				if (category === 'music') {
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

	private bus(category: AudioCategory): GainNode {
		this.ensureContext();
		return this.buses.get(category) as GainNode;
	}
}

/** Synthetic stone-room impulse response: stereo noise with an exponential tail. */
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
			// Early reflections are denser; the tail decays over about IMPULSE_SECONDS.
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
