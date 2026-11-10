import type { AudioCategory } from '#lib/game/audio/AudioManager.ts';

/**
 * Sound registry. Each sound is either a file (`url`, under static/assets/audio) or a
 * placeholder synthesized in code (`synth`). Replacing a placeholder with a recording is a
 * data change: add `url` (it wins over `synth`). See docs/dev/player.md.
 */

export type SynthSpec =
	/** Filtered noise burst with a low thump. cutoff in Hz, decay in seconds. */
	| { kind: 'footstep'; cutoff: number; decay: number; thump: number }
	/** Inhale/exhale loop of band-limited noise, `period` seconds long. */
	| { kind: 'breath'; period: number }
	| { kind: 'click' };

export interface SoundDef {
	url?: string;
	synth?: SynthSpec;
	category: Exclude<AudioCategory, 'master'>;
	volume: number;
	/** Random playback-rate spread (0.1 = +-10%) so repeats don't sound identical. */
	variation?: number;
}

export const SOUNDS = {
	'footstep.stone': {
		synth: { kind: 'footstep', cutoff: 1400, decay: 0.07, thump: 0.6 },
		category: 'sfx',
		volume: 0.5,
		variation: 0.12
	},
	'footstep.rock': {
		synth: { kind: 'footstep', cutoff: 900, decay: 0.09, thump: 0.8 },
		category: 'sfx',
		volume: 0.5,
		variation: 0.15
	},
	'footstep.tile': {
		synth: { kind: 'footstep', cutoff: 3200, decay: 0.05, thump: 0.35 },
		category: 'sfx',
		volume: 0.45,
		variation: 0.1
	},
	'footstep.marble': {
		synth: { kind: 'footstep', cutoff: 4200, decay: 0.12, thump: 0.3 },
		category: 'sfx',
		volume: 0.45,
		variation: 0.08
	},
	breath: { synth: { kind: 'breath', period: 3.2 }, category: 'sfx', volume: 0.6 },
	'headlamp.click': { synth: { kind: 'click' }, category: 'sfx', volume: 0.5 }
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
