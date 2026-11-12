/**
 * Which raw recordings in art/sfx become game sounds, and how they're processed.
 * Run `pnpm asset:audio` after changing this. See docs/dev/asset-pipeline.md.
 *
 * `id` is what the sound registry (src/lib/content/audio/sounds.ts) refers to as `file`.
 * `slice` cuts a recording of several hits (e.g. a run of footsteps) into one file per hit;
 * the game picks a random one each time. Several source files also become variants of one id.
 */

export interface AudioSource {
	id: string;
	/** File name(s) in art/sfx (16-bit PCM .wav or .mp3). Several files become variants. */
	file: string | string[];
	slice?: {
		/** Minimum seconds between hits. */
		minGap: number;
		/** Longest slice in seconds (cut before the next hit regardless). */
		maxLength: number;
		/** Onset threshold as a fraction of the loudest moment. */
		threshold?: number;
		/** Keep at most this many slices (evenly spread through the recording). */
		maxClips?: number;
	};
	/** Use only part of the recording: `start` and `length` in seconds. */
	crop?: { start: number; length: number };
	/** Make the clip loop seamlessly by crossfading its end into its start (seconds). */
	loopCrossfade?: number;
	/** Keep the original length instead of trimming silence (loops). */
	keepSilence?: boolean;
	/** Output sample rate (default 32000). Long, dark ambience is fine at 22050 and half the size. */
	rate?: number;
}

export const AUDIO_SOURCES: AudioSource[] = [
	{ id: 'footstep.walk', file: 'footsteps_walking.wav', slice: { minGap: 0.3, maxLength: 0.4 } },
	{ id: 'footstep.run', file: 'footsteps_running.wav', slice: { minGap: 0.22, maxLength: 0.3 } },
	{ id: 'breath.slow', file: 'breathing_slow.wav', keepSilence: true },
	{ id: 'breath.fast', file: 'breathing_fast.wav', keepSilence: true },
	{ id: 'gasp', file: 'gasp.wav' },
	// Effort grunts for climbing and pushing through squeezes.
	{ id: 'exertion', file: 'exertion.mp3', slice: { minGap: 0.6, maxLength: 1.0, threshold: 0.3 } },
	{ id: 'headlamp.on', file: 'flashlight_on.wav' },
	{ id: 'headlamp.off', file: 'flashlight_off.wav' },
	{ id: 'water.slosh', file: 'liquid_slosh.wav' },
	{
		id: 'water.splash',
		file: 'liquid_slosh.wav',
		slice: { minGap: 0.18, maxLength: 0.35, threshold: 0.35 }
	},
	// Something put down in an inventory slot.
	{ id: 'inventory.drop', file: 'slot-drop.mp3' },
	// Going through the pack: one handful of the recording per variant.
	{
		id: 'inventory.rummage',
		file: 'rummage.mp3',
		slice: { minGap: 0.9, maxLength: 1.3, threshold: 0.3, maxClips: 4 }
	},
	// Firearms.
	{ id: 'revolver.fire', file: 'sfx_revolver_attack.mp3' },
	{ id: 'shotgun.fire', file: 'sfx_shotgun_attack.mp3' },
	// Any gunshot heard from far off (another explorer's, down the tunnels).
	{ id: 'gun.distant', file: 'sfx_gun_attack_distance.mp3', rate: 22050 },
	// Dry fire: the first click only (the recording has a second, fainter one).
	{ id: 'gun.empty', file: 'sfx_gun_empty.mp3', crop: { start: 0.1, length: 0.8 } },
	{ id: 'revolver.reload', file: 'sfx_revolver_reload.mp3' },
	{ id: 'shotgun.reload', file: 'sfx_shotgun_reload.mp3' },
	// Interface: moving between pages on the surface.
	{ id: 'ui.click', file: 'menu_click.wav' },
	// Stingers: going down at the start of an expedition, and coming up at the end of it.
	{ id: 'expedition.intro', file: 'sfx_expedition_intro.mp3', rate: 22050 },
	{ id: 'expedition.outro', file: 'sfx_extraction_outro.mp3', rate: 22050 },
	// Ambience
	{
		id: 'ambience.drip',
		file: 'water-drips.mp3',
		slice: { minGap: 0.5, maxLength: 0.6, threshold: 0.3, maxClips: 12 }
	},
	{ id: 'ambience.knock', file: 'door-knocking.mp3' },
	{ id: 'ambience.rockfall', file: 'rockfall.mp3', rate: 22050 },
	{
		id: 'ambience.creak',
		file: 'creaks.mp3',
		slice: { minGap: 2.0, maxLength: 3.5, threshold: 0.35, maxClips: 5 },
		rate: 22050
	},
	{
		id: 'ambience.lap',
		file: 'water_lapping.mp3',
		crop: { start: 20, length: 10 },
		loopCrossfade: 1,
		keepSilence: true,
		rate: 22050
	},
	{
		id: 'ambience.creepy',
		file: ['creepy_ambience_1.wav', 'creepy_ambience_2.wav'],
		rate: 22050
	},
	{ id: 'ambience.horror', file: 'horror_ambient.mp3', crop: { start: 4, length: 12 }, rate: 22050 }
];
