/**
 * All game audio routes through here. Each sound plays on a category bus whose
 * volume comes from player settings; every bus feeds the master bus.
 * Voice is intentionally absent until voice chat is in scope.
 */

const OPEN_FREQUENCY = 20000;
const MUFFLED_FREQUENCY = 500;

export const AUDIO_CATEGORIES = ['master', 'music', 'ambience', 'sfx'] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export interface PlayOptions {
	category?: Exclude<AudioCategory, 'master'>;
	volume?: number;
	loop?: boolean;
	/** Playback rate (1 = normal); also shifts pitch. */
	rate?: number;
}

/** A playing sound whose volume and rate can change while it plays (loops, breathing). */
export interface SoundHandle {
	setVolume(value: number): void;
	setRate(value: number): void;
	stop(): void;
}

export class AudioManager {
	private context: AudioContext | null = null;
	private buses = new Map<AudioCategory, GainNode>();
	private muffler: BiquadFilterNode | null = null;
	private buffers = new Map<string, Promise<AudioBuffer>>();
	private volumes: Record<AudioCategory, number>;

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
		const context = this.ensureContext();
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = options.loop ?? false;
		source.playbackRate.value = options.rate ?? 1;
		const gain = context.createGain();
		gain.gain.value = options.volume ?? 1;
		source.connect(gain).connect(this.bus(options.category ?? 'sfx'));
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

	/** The Web Audio context (created on first use); synthesized sounds are built against it. */
	get audioContext(): AudioContext {
		return this.ensureContext();
	}

	get unlocked(): boolean {
		return this.context?.state === 'running';
	}

	dispose(): void {
		void this.context?.close();
		this.context = null;
		this.buses.clear();
		this.muffler = null;
		this.buffers.clear();
	}

	private ensureContext(): AudioContext {
		if (!this.context) {
			this.context = new AudioContext();
			const master = this.context.createGain();
			master.gain.value = this.volumes.master;
			master.connect(this.context.destination);
			this.buses.set('master', master);
			// World sounds (sfx, ambience) pass through a low-pass filter used for muffling
			// (underwater, later tight spaces). Music bypasses it.
			this.muffler = this.context.createBiquadFilter();
			this.muffler.type = 'lowpass';
			this.muffler.frequency.value = OPEN_FREQUENCY;
			this.muffler.connect(master);
			for (const category of AUDIO_CATEGORIES) {
				if (category === 'master') continue;
				const bus = this.context.createGain();
				bus.gain.value = this.volumes[category];
				bus.connect(category === 'music' ? master : this.muffler);
				this.buses.set(category, bus);
			}
		}
		return this.context;
	}

	/** Muffle world sounds: 0 = clear, 1 = fully muffled (underwater). */
	setMuffle(amount: number): void {
		if (!this.context || !this.muffler) return;
		const a = Math.max(0, Math.min(1, amount));
		// Interpolate on a log scale so the sweep sounds even.
		const frequency = OPEN_FREQUENCY * Math.pow(MUFFLED_FREQUENCY / OPEN_FREQUENCY, a);
		this.muffler.frequency.setTargetAtTime(frequency, this.context.currentTime, 0.08);
	}

	private bus(category: AudioCategory): GainNode {
		this.ensureContext();
		return this.buses.get(category) as GainNode;
	}
}
