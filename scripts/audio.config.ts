/**
 * Which raw recordings in art/sfx become game sounds, and how they're processed.
 * Run `pnpm asset:audio` after changing this. See docs/dev/asset-pipeline.md.
 *
 * `id` is what the sound registry (src/lib/content/audio/sounds.ts) refers to as `file`.
 * `slice` cuts a recording of several hits (e.g. a run of footsteps) into one file per hit;
 * the game picks a random one each time.
 */

export interface AudioSource {
	id: string;
	/** File name in art/sfx. */
	file: string;
	slice?: {
		/** Minimum seconds between hits. */
		minGap: number;
		/** Longest slice in seconds (cut before the next hit regardless). */
		maxLength: number;
		/** Onset threshold as a fraction of the loudest moment. */
		threshold?: number;
	};
	/** Keep the original length instead of trimming silence (loops). */
	keepSilence?: boolean;
}

export const AUDIO_SOURCES: AudioSource[] = [
	{ id: 'footstep.walk', file: 'footsteps_walking.wav', slice: { minGap: 0.3, maxLength: 0.4 } },
	{ id: 'footstep.run', file: 'footsteps_running.wav', slice: { minGap: 0.22, maxLength: 0.3 } },
	{ id: 'breath.slow', file: 'breathing_slow.wav', keepSilence: true },
	{ id: 'breath.fast', file: 'breathing_fast.wav', keepSilence: true },
	{ id: 'gasp', file: 'gasp.wav' },
	{ id: 'headlamp.on', file: 'flashlight_on.wav' },
	{ id: 'headlamp.off', file: 'flashlight_off.wav' },
	{ id: 'water.slosh', file: 'liquid_slosh.wav' },
	{
		id: 'water.splash',
		file: 'liquid_slosh.wav',
		slice: { minGap: 0.18, maxLength: 0.35, threshold: 0.35 }
	}
];
