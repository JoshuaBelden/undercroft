import type { AudioCategory } from '#lib/game/audio/AudioManager.ts';

/**
 * Sound registry. A sound plays a built recording (`file`: an id from `pnpm asset:audio`, see
 * scripts/audio.config.ts) and falls back to a placeholder synthesized in code (`synth`) when
 * no recording is built for it. See docs/dev/player.md.
 */

export type SynthSpec =
	/** Filtered noise burst with a low thump. cutoff in Hz, decay in seconds. */
	| { kind: 'footstep'; cutoff: number; decay: number; thump: number }
	/** Inhale/exhale loop of band-limited noise, `period` seconds long. */
	| { kind: 'breath'; period: number }
	| { kind: 'click' }
	/** Watery noise burst; `length` seconds, `cutoff` Hz. */
	| { kind: 'splash'; length: number; cutoff: number }
	/** Stone scrape plus an effort grunt, for climbing. */
	| { kind: 'scrape' }
	/** Sharp inhale, for surfacing out of breath. */
	| { kind: 'gasp' }
	/** Water drop plink. */
	| { kind: 'drip' }
	/** Distant knock with echoes. */
	| { kind: 'knock' }
	/** Distant trickle of falling stones. */
	| { kind: 'rockfall' }
	/** Low settling groan of the rock. */
	| { kind: 'groan' }
	/** Soft water lapping loop. */
	| { kind: 'lap' }
	/** Dragging, shuffling step (creatures). */
	| { kind: 'shuffle' }
	/** Rushing scuff of a sudden burst of speed. */
	| { kind: 'rush' }
	/** Rasping snarl with a strike. */
	| { kind: 'snarl' }
	/** Short pained breath when hurt. */
	| { kind: 'hurt' }
	/** Heartbeat loop: lub-dub every `period` seconds. */
	| { kind: 'heartbeat'; period: number }
	/** Unintelligible breathy whisper. */
	| { kind: 'whisper' }
	/** Gunshot: sharp crack, low boom at `boom` Hz, long tail. `length` seconds. */
	| { kind: 'gunshot'; boom: number; length: number; bright: number }
	/** Air moving past (a swing, a throw). */
	| { kind: 'whoosh' }
	/** Blunt impact; low `cutoff` (Hz) is soft and fleshy, high is hard. */
	| { kind: 'thud'; cutoff: number }
	/** Something hard breaking apart. */
	| { kind: 'crack' }
	/** Mechanical clicks: rounds going in, cylinder or breech closing. */
	| { kind: 'reload' }
	/** Cloth and small things being picked up. */
	| { kind: 'rustle' };

export interface SoundDef {
	/** Built recording id(s) (AUDIO_FILES); a random variant of all of them plays each time. */
	file?: string | string[];
	/** Placeholder used when `file` isn't built. */
	synth?: SynthSpec;
	category: Exclude<AudioCategory, 'master'>;
	volume: number;
	/** Base playback rate; shifts pitch (used to vary one recording across surfaces). */
	rate?: number;
	/** Random playback-rate spread (0.1 = +-10%) so repeats don't sound identical. */
	variation?: number;
}

const STEP = { kind: 'footstep', cutoff: 1400, decay: 0.07, thump: 0.6 } as const;
const SPLASH = { kind: 'splash', length: 0.6, cutoff: 1200 } as const;

export const SOUNDS = {
	// One walking recording, pitched per surface.
	'footstep.stone': {
		file: 'footstep.walk',
		synth: STEP,
		category: 'sfx',
		volume: 0.55,
		variation: 0.06
	},
	'footstep.rock': {
		file: 'footstep.walk',
		synth: STEP,
		category: 'sfx',
		volume: 0.55,
		rate: 0.9,
		variation: 0.06
	},
	'footstep.tile': {
		file: 'footstep.walk',
		synth: STEP,
		category: 'sfx',
		volume: 0.5,
		rate: 1.1,
		variation: 0.05
	},
	'footstep.marble': {
		file: 'footstep.walk',
		synth: STEP,
		category: 'sfx',
		volume: 0.5,
		rate: 1.18,
		variation: 0.05
	},
	'footstep.run': {
		file: 'footstep.run',
		synth: STEP,
		category: 'sfx',
		volume: 0.6,
		variation: 0.06
	},
	'footstep.wade': {
		file: 'water.splash',
		synth: { kind: 'splash', length: 0.35, cutoff: 1800 },
		category: 'sfx',
		volume: 0.5,
		variation: 0.1
	},
	'swim.stroke': {
		file: 'water.slosh',
		synth: SPLASH,
		category: 'sfx',
		volume: 0.35,
		rate: 1.15,
		variation: 0.12
	},
	'water.enter': {
		file: 'water.slosh',
		synth: { kind: 'splash', length: 1.0, cutoff: 2600 },
		category: 'sfx',
		volume: 0.9,
		rate: 0.85,
		variation: 0.05
	},
	mantle: {
		file: 'exertion',
		synth: { kind: 'scrape' },
		category: 'sfx',
		volume: 0.6,
		variation: 0.06
	},
	'squeeze.grunt': {
		file: 'exertion',
		synth: { kind: 'scrape' },
		category: 'sfx',
		volume: 0.45,
		variation: 0.1
	},
	gasp: { file: 'gasp', synth: { kind: 'gasp' }, category: 'sfx', volume: 0.8 },
	// Breathing loops, crossfaded by stamina.
	'breath.slow': {
		file: 'breath.slow',
		synth: { kind: 'breath', period: 3.2 },
		category: 'sfx',
		volume: 0.5
	},
	'breath.fast': {
		file: 'breath.fast',
		synth: { kind: 'breath', period: 1.6 },
		category: 'sfx',
		volume: 0.7
	},
	// Ambience (played around the listener by Ambience.ts).
	'ambience.drip': {
		file: 'ambience.drip',
		synth: { kind: 'drip' },
		category: 'ambience',
		volume: 0.6,
		variation: 0.25
	},
	'ambience.knock': {
		file: 'ambience.knock',
		synth: { kind: 'knock' },
		category: 'ambience',
		volume: 0.8,
		variation: 0.1
	},
	'ambience.rockfall': {
		file: 'ambience.rockfall',
		synth: { kind: 'rockfall' },
		category: 'ambience',
		volume: 0.7,
		variation: 0.1
	},
	'ambience.creak': {
		file: 'ambience.creak',
		synth: { kind: 'groan' },
		category: 'ambience',
		volume: 0.8,
		variation: 0.08
	},
	'ambience.lap': {
		file: 'ambience.lap',
		synth: { kind: 'lap' },
		category: 'ambience',
		volume: 0.5
	},
	// Rare unsettling ambient swells, played at random times (not placed in the world).
	'ambience.creepy': {
		file: ['ambience.creepy', 'ambience.horror'],
		synth: { kind: 'groan' },
		category: 'ambience',
		volume: 0.6
	},
	// Creatures (played at their position: you hear what you can't see).
	'creature.step': {
		synth: { kind: 'shuffle' },
		category: 'sfx',
		volume: 0.55,
		variation: 0.15
	},
	'creature.burst': { synth: { kind: 'rush' }, category: 'sfx', volume: 0.8, variation: 0.1 },
	'creature.attack': { synth: { kind: 'snarl' }, category: 'sfx', volume: 0.9, variation: 0.08 },
	'creature.hurt': {
		synth: { kind: 'snarl' },
		category: 'sfx',
		volume: 0.8,
		rate: 1.35,
		variation: 0.1
	},
	'creature.die': { synth: { kind: 'snarl' }, category: 'sfx', volume: 1, rate: 0.7 },
	// Items and weapons.
	'revolver.fire': {
		synth: { kind: 'gunshot', boom: 95, length: 1.8, bright: 4200 },
		category: 'sfx',
		volume: 1,
		variation: 0.04
	},
	'shotgun.fire': {
		synth: { kind: 'gunshot', boom: 60, length: 2.4, bright: 2600 },
		category: 'sfx',
		volume: 1,
		variation: 0.04
	},
	'gun.empty': { synth: { kind: 'click' }, category: 'sfx', volume: 0.6, rate: 0.8 },
	'gun.reload': { synth: { kind: 'reload' }, category: 'sfx', volume: 0.6 },
	'melee.swing': { synth: { kind: 'whoosh' }, category: 'sfx', volume: 0.5, variation: 0.15 },
	'melee.hit': {
		synth: { kind: 'thud', cutoff: 1800 },
		category: 'sfx',
		volume: 0.7,
		variation: 0.1
	},
	'melee.hit.creature': {
		synth: { kind: 'thud', cutoff: 450 },
		category: 'sfx',
		volume: 0.9,
		variation: 0.1
	},
	'bullet.impact': {
		synth: { kind: 'thud', cutoff: 3200 },
		category: 'sfx',
		volume: 0.5,
		variation: 0.2
	},
	'brick.throw': { synth: { kind: 'whoosh' }, category: 'sfx', volume: 0.5, rate: 0.75 },
	'brick.land': {
		synth: { kind: 'thud', cutoff: 1300 },
		category: 'sfx',
		volume: 0.9,
		variation: 0.1
	},
	'brick.break': { synth: { kind: 'crack' }, category: 'sfx', volume: 0.8, variation: 0.1 },
	'item.pickup': { synth: { kind: 'rustle' }, category: 'sfx', volume: 0.5, variation: 0.1 },
	// Sanity.
	'player.hurt': { synth: { kind: 'hurt' }, category: 'sfx', volume: 0.8, variation: 0.08 },
	heartbeat: { synth: { kind: 'heartbeat', period: 0.85 }, category: 'sfx', volume: 0.8 },
	whisper: { synth: { kind: 'whisper' }, category: 'ambience', volume: 0.5, variation: 0.15 },
	'headlamp.on': { file: 'headlamp.on', synth: { kind: 'click' }, category: 'sfx', volume: 0.5 },
	'headlamp.off': { file: 'headlamp.off', synth: { kind: 'click' }, category: 'sfx', volume: 0.5 }
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
