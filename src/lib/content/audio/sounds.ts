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
	/** Sharp inhale (starting to push through a squeeze). */
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
	| { kind: 'rustle' }
	/** Low, beating drone loop (`pitch` Hz). */
	| { kind: 'drone'; pitch: number }
	/** A huge, distant exhalation through the stone: something has arrived. */
	| { kind: 'signal' }
	/** Hissing recoil (light on the manifestation). */
	| { kind: 'hiss' }
	/** A struck bell at `pitch` Hz ringing out over `length` seconds. */
	| { kind: 'bell'; pitch: number; length: number };

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
	/**
	 * What the player reads when sound captions are on: lowercase, no brackets. Sounds without
	 * one are never captioned (the player's own footsteps, breath, clicks).
	 */
	caption?: string;
	/** Caption it only when it comes from the world, not when the player makes it themselves. */
	captionOthers?: boolean;
}

/**
 * Another explorer's gunshot: within `from` metres you hear the gun itself; over the next `span`
 * metres it crossfades into `gun.distant`, which carries far (`refDistance`).
 */
export const DISTANT_SHOT = { from: 15, span: 15, refDistance: 25 };

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
	// A sharp breath as you start to push through a squeeze (PlayerAudio.updateSqueeze).
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
		variation: 0.1,
		caption: 'distant knocking'
	},
	'ambience.rockfall': {
		file: 'ambience.rockfall',
		synth: { kind: 'rockfall' },
		category: 'ambience',
		volume: 0.7,
		variation: 0.1,
		caption: 'stones falling, far off'
	},
	'ambience.creak': {
		file: 'ambience.creak',
		synth: { kind: 'groan' },
		category: 'ambience',
		volume: 0.8,
		variation: 0.08,
		caption: 'the rock groans'
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
		volume: 0.6,
		caption: 'something moans in the deep'
	},
	// Creatures (played at their position: you hear what you can't see).
	'creature.step': {
		file: 'creature.step',
		synth: { kind: 'shuffle' },
		category: 'sfx',
		volume: 0.55,
		variation: 0.15,
		caption: 'shuffling steps'
	},
	// The jump scare: at most once every BURST_SOUND_GAP seconds per creature (Creatures.ts).
	'creature.burst': {
		file: 'creature.burst',
		synth: { kind: 'rush' },
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'something rushes'
	},
	'creature.attack': {
		file: 'creature.attack',
		synth: { kind: 'snarl' },
		category: 'sfx',
		volume: 0.9,
		variation: 0.08,
		caption: 'snarl'
	},
	// Looped; louder the closer the nearest creature is (within its breath.range).
	'creature.breath': {
		file: 'creature.breath',
		synth: { kind: 'breath', period: 3 },
		category: 'sfx',
		volume: 0.8,
		caption: 'ragged breathing nearby'
	},
	'creature.hurt': {
		synth: { kind: 'snarl' },
		category: 'sfx',
		volume: 0.8,
		rate: 1.35,
		variation: 0.1,
		caption: 'pained shriek'
	},
	'creature.die': {
		file: 'creature.die',
		synth: { kind: 'snarl' },
		category: 'sfx',
		volume: 1,
		caption: 'dying rattle'
	},
	// Items and weapons.
	'revolver.fire': {
		file: 'revolver.fire',
		synth: { kind: 'gunshot', boom: 95, length: 1.8, bright: 4200 },
		category: 'sfx',
		volume: 1,
		variation: 0.04,
		caption: 'gunshot',
		captionOthers: true
	},
	'shotgun.fire': {
		file: 'shotgun.fire',
		synth: { kind: 'gunshot', boom: 60, length: 2.4, bright: 2600 },
		category: 'sfx',
		volume: 1,
		variation: 0.04,
		caption: 'shotgun blast',
		captionOthers: true
	},
	// Another explorer's shot from far away (crossfaded in with distance, see docs/dev/items.md).
	'gun.distant': {
		file: 'gun.distant',
		synth: { kind: 'gunshot', boom: 70, length: 2.6, bright: 900 },
		category: 'sfx',
		volume: 0.9,
		variation: 0.05,
		caption: 'distant gunshot'
	},
	'gun.empty': {
		file: 'gun.empty',
		synth: { kind: 'click' },
		category: 'sfx',
		volume: 0.6,
		variation: 0.04
	},
	// The recording runs 3.15 s; played a little fast to fit the revolver's 2.5 s reload.
	'revolver.reload': {
		file: 'revolver.reload',
		synth: { kind: 'reload' },
		category: 'sfx',
		volume: 0.6,
		rate: 1.25
	},
	'shotgun.reload': {
		file: 'shotgun.reload',
		synth: { kind: 'reload' },
		category: 'sfx',
		volume: 0.65
	},
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
		variation: 0.1,
		caption: 'brick clatters'
	},
	'brick.break': {
		synth: { kind: 'crack' },
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'brick shatters'
	},
	'item.pickup': { synth: { kind: 'rustle' }, category: 'sfx', volume: 0.5, variation: 0.1 },
	'item.drop': {
		synth: { kind: 'thud', cutoff: 700 },
		category: 'sfx',
		volume: 0.4,
		variation: 0.15,
		caption: 'something dropped',
		captionOthers: true
	},
	// The Affliction.
	'omen.drone': {
		synth: { kind: 'drone', pitch: 41 },
		category: 'ambience',
		volume: 0.6,
		caption: 'low hum'
	},
	// Putting something down in a slot: the Loadout page and the pack screen.
	'inventory.drop': {
		file: 'inventory.drop',
		synth: { kind: 'thud', cutoff: 900 },
		category: 'sfx',
		volume: 0.35,
		variation: 0.12
	},
	// Going through a loot crate: once for each thing as it starts to be revealed.
	'inventory.rummage': {
		file: 'inventory.rummage',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.4,
		variation: 0.1,
		caption: 'rummaging',
		captionOthers: true
	},
	// The lid of a loot crate, the first time it is lifted.
	'crate.open': {
		synth: { kind: 'thud', cutoff: 500 },
		category: 'sfx',
		volume: 0.5,
		variation: 0.1,
		caption: 'a lid creaks open',
		captionOthers: true
	},
	// Turning over a corpse to search it, the first time.
	'corpse.search': {
		file: 'corpse.search',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'someone rummages through a pack',
		captionOthers: true
	},
	// Chalk on stone: a mark drawn, or rubbed out by whoever drew it.
	'chalk.draw': {
		synth: { kind: 'scrape' },
		category: 'sfx',
		volume: 0.45,
		rate: 1.6,
		variation: 0.1,
		caption: 'chalk scratches on stone',
		captionOthers: true
	},
	'chalk.rub': {
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.35,
		variation: 0.1,
		caption: 'chalk is rubbed away',
		captionOthers: true
	},
	// The surface.
	/** Moving between pages (the tabs, the store, social, settings). */
	'ui.click': { file: 'ui.click', synth: { kind: 'click' }, category: 'sfx', volume: 0.5 },
	// Stingers on the music bus (dry: no muffling or reverb from where you stand).
	'expedition.intro': { file: 'expedition.intro', category: 'music', volume: 0.8 },
	'expedition.outro': { file: 'expedition.outro', category: 'music', volume: 0.8 },
	/** Finding something epic, legendary or a quest item (revealed in a crate, or picked up). */
	'loot.found': { file: 'loot.found', category: 'music', volume: 0.8 },
	'shop.buy': { synth: { kind: 'click' }, category: 'sfx', volume: 0.6 },
	'shop.sell': { synth: { kind: 'bell', pitch: 1320, length: 0.5 }, category: 'sfx', volume: 0.3 },
	// The rite.
	'clue.sting': {
		synth: { kind: 'bell', pitch: 660, length: 1.6 },
		category: 'sfx',
		volume: 0.5,
		caption: 'a clear, small chime'
	},
	'rite.begin': {
		synth: { kind: 'bell', pitch: 196, length: 3 },
		category: 'sfx',
		volume: 0.6,
		caption: 'a low bell'
	},
	'rite.resolve': {
		synth: { kind: 'bell', pitch: 98, length: 7 },
		category: 'sfx',
		volume: 0.9,
		caption: 'a deep bell tolls'
	},
	'manifest.signal': {
		synth: { kind: 'signal' },
		category: 'ambience',
		volume: 1,
		caption: 'a vast breath through the stone'
	},
	'manifest.presence': {
		synth: { kind: 'drone', pitch: 33 },
		category: 'sfx',
		volume: 0.9,
		caption: 'deep rumbling'
	},
	'manifest.hiss': {
		synth: { kind: 'hiss' },
		category: 'sfx',
		volume: 0.7,
		variation: 0.1,
		caption: 'something hisses'
	},
	'manifest.touch': { synth: { kind: 'snarl' }, category: 'sfx', volume: 1, rate: 0.5 },
	'manifest.banish': {
		synth: { kind: 'signal' },
		category: 'sfx',
		volume: 1,
		rate: 1.6,
		caption: 'a howl, receding'
	},
	// Sanity.
	'player.hurt': { synth: { kind: 'hurt' }, category: 'sfx', volume: 0.8, variation: 0.08 },
	// A blow taken by what you wear (no sanity lost), and the blow that tears it apart.
	'player.shielded': {
		synth: { kind: 'thud', cutoff: 400 },
		category: 'sfx',
		volume: 0.7,
		variation: 0.1,
		caption: 'a muffled blow'
	},
	// A battery swapped into the headlamp.
	'battery.charged': {
		file: 'battery.charged',
		synth: { kind: 'click' },
		category: 'sfx',
		volume: 0.7,
		caption: 'a battery clicks into place'
	},
	// The headlamp running low (under its lowAlert volts), once a minute while it's on.
	'battery.low': {
		file: 'battery.low',
		synth: { kind: 'bell', pitch: 880, length: 0.4 },
		category: 'sfx',
		volume: 0.6,
		caption: 'your headlamp beeps: battery low'
	},
	// Starting to bind a wound.
	bandage: {
		file: 'bandage',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.7,
		caption: 'linen being wound'
	},
	'defense.torn': {
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.7,
		rate: 0.6,
		caption: 'cloth tears'
	},
	heartbeat: {
		synth: { kind: 'heartbeat', period: 0.85 },
		category: 'sfx',
		volume: 0.8,
		caption: 'heartbeat'
	},
	whisper: {
		synth: { kind: 'whisper' },
		category: 'ambience',
		volume: 0.5,
		variation: 0.15,
		caption: 'whispering'
	},
	'headlamp.on': { file: 'headlamp.on', synth: { kind: 'click' }, category: 'sfx', volume: 0.5 },
	'headlamp.off': { file: 'headlamp.off', synth: { kind: 'click' }, category: 'sfx', volume: 0.5 }
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
