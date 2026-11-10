import { AUDIO_FILES } from '#lib/content/audio/files.generated.ts';
import { SOUNDS, type SoundDef, type SoundId } from '#lib/content/audio/sounds.ts';
import type { AudioManager, SoundHandle } from './AudioManager.ts';
import { synthesize } from './synth.ts';

/**
 * Plays registered sounds by id (see src/lib/content/audio/sounds.ts). Each sound resolves to its
 * built recording variants, or to its synthesized placeholder if none are built, and plays
 * through the AudioManager's category buses.
 */
export class SoundBank {
	private variants = new Map<SoundId, Promise<AudioBuffer[]>>();

	constructor(private audio: AudioManager) {}

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
	playAt(id: SoundId, position: [number, number, number], volume = 1, refDistance?: number): void {
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
			setVolume: (value) => handle.setVolume(value * def.volume),
			setRate: (value) => handle.setRate(value * (def.rate ?? 1)),
			stop: () => handle.stop()
		};
	}
}
