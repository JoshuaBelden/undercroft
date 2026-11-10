import { SOUNDS, type SoundDef, type SoundId } from '#lib/content/audio/sounds.ts';
import type { AudioManager, SoundHandle } from './AudioManager.ts';
import { synthesize } from './synth.ts';

/**
 * Plays registered sounds by id (see src/lib/content/audio/sounds.ts). Resolves each id once,
 * from its file or its synthesized placeholder, and routes it through the AudioManager.
 */
export class SoundBank {
	private buffers = new Map<SoundId, Promise<AudioBuffer>>();

	constructor(private audio: AudioManager) {}

	private buffer(id: SoundId): Promise<AudioBuffer> {
		let pending = this.buffers.get(id);
		if (!pending) {
			const def: SoundDef = SOUNDS[id];
			if (def.url) pending = this.audio.load(def.url);
			else if (def.synth) pending = Promise.resolve(synthesize(this.audio.audioContext, def.synth));
			else pending = Promise.reject(new Error(`Sound "${id}" has no url or synth`));
			this.buffers.set(id, pending);
		}
		return pending;
	}

	/** Fire-and-forget one-shot. `volume` multiplies the sound's own volume. */
	play(id: SoundId, volume = 1): void {
		if (!this.audio.unlocked) return;
		const def: SoundDef = SOUNDS[id];
		const spread = def.variation ?? 0;
		void this.buffer(id).then((buffer) =>
			this.audio.playBuffer(buffer, {
				category: def.category,
				volume: def.volume * volume,
				rate: 1 + (Math.random() * 2 - 1) * spread
			})
		);
	}

	/** Start a looping sound; adjust or stop it through the handle. */
	async loop(id: SoundId, volume = 0): Promise<SoundHandle> {
		const def: SoundDef = SOUNDS[id];
		const buffer = await this.buffer(id);
		const handle = this.audio.playBuffer(buffer, { category: def.category, volume, loop: true });
		return {
			setVolume: (value) => handle.setVolume(value * def.volume),
			setRate: (value) => handle.setRate(value),
			stop: () => handle.stop()
		};
	}
}
