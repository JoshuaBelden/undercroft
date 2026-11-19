import type { AudioCategory } from './categories.ts';

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
	/** A small animal's high, bending squeak, `pitch` Hz at its peak. */
	| { kind: 'squeak'; pitch: number }
	/** Tiny claws on stone (rats, spiders). */
	| { kind: 'skitter' }
	/** Soft wingbeats loop, `rate` beats a second (moths). */
	| { kind: 'flutter'; rate: number }
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
	/** Hissing recoil: the stunned manifestation's placeholder, if its recording isn't built. */
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
		file: 'squeeze.grunt',
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
		volume: 0.4,
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
	/** The bed under the dashboard and every page off the expedition (FadingLoop.ts, from the root layout), looped. */
	'ambience.dashboard': { file: 'ambience.dashboard', category: 'ambience', volume: 0.5 },
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
		volume: 0.8,
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
		file: 'creature.hurt',
		synth: { kind: 'snarl' },
		category: 'sfx',
		volume: 0.7,
		variation: 0.1,
		caption: 'pained shriek'
	},
	'creature.die': {
		file: 'creature.die',
		synth: { kind: 'snarl' },
		category: 'sfx',
		volume: 0.5,
		caption: 'dying rattle'
	},
	// Rats (placeholders until there are recordings).
	'rat.step': {
		synth: { kind: 'skitter' },
		category: 'sfx',
		volume: 0.45,
		variation: 0.2,
		caption: 'skittering claws'
	},
	'rat.squeak': {
		synth: { kind: 'squeak', pitch: 3200 },
		category: 'sfx',
		volume: 0.5,
		variation: 0.2,
		caption: 'squeaking'
	},
	'rat.bite': {
		synth: { kind: 'squeak', pitch: 2400 },
		category: 'sfx',
		volume: 0.7,
		variation: 0.15,
		caption: 'a rat bites'
	},
	'rat.die': {
		synth: { kind: 'squeak', pitch: 1800 },
		category: 'sfx',
		volume: 0.5,
		caption: 'a squeal cut short'
	},
	// Spiders (placeholders until there are recordings).
	'spider.step': {
		synth: { kind: 'skitter' },
		category: 'sfx',
		volume: 0.35,
		variation: 0.25,
		caption: 'many legs'
	},
	'spider.hiss': {
		synth: { kind: 'hiss' },
		category: 'sfx',
		volume: 0.6,
		variation: 0.2,
		caption: 'a hiss'
	},
	'spider.die': {
		synth: { kind: 'crack' },
		category: 'sfx',
		volume: 0.4,
		variation: 0.2,
		caption: 'a crunch'
	},
	'spider.giant.step': {
		synth: { kind: 'skitter' },
		category: 'sfx',
		volume: 0.8,
		rate: 0.6,
		variation: 0.15,
		caption: 'heavy legs on stone'
	},
	'spider.giant.hiss': {
		synth: { kind: 'hiss' },
		category: 'sfx',
		volume: 0.9,
		rate: 0.7,
		variation: 0.1,
		caption: 'a deep hiss'
	},
	// Moths: a soft flutter while they fly (placeholder until there's a recording).
	'moth.flutter': {
		synth: { kind: 'flutter', rate: 18 },
		category: 'sfx',
		volume: 0.25,
		variation: 0.2,
		caption: 'wings flutter'
	},
	// The surveyor sharing his map: paper unfolding (placeholder until there's a recording).
	'surveyor.share': {
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.7,
		variation: 0.1,
		caption: 'paper unfolding'
	},
	// Dwellers (placeholders until there are recordings).
	'dweller.step': {
		synth: { kind: 'shuffle' },
		category: 'sfx',
		volume: 0.5,
		rate: 1.2,
		variation: 0.15,
		caption: 'soft footsteps'
	},
	'dweller.murmur': {
		synth: { kind: 'whisper' },
		category: 'sfx',
		volume: 0.5,
		variation: 0.2,
		caption: 'a murmur'
	},
	// Items and weapons.
	'revolver.fire': {
		file: 'revolver.fire',
		synth: { kind: 'gunshot', boom: 95, length: 1.8, bright: 4200 },
		category: 'sfx',
		volume: 0.55,
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
	'knife.throw': { synth: { kind: 'whoosh' }, category: 'sfx', volume: 0.4, rate: 1.3 },
	'knife.land': {
		synth: { kind: 'thud', cutoff: 3600 },
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'knife clatters'
	},
	/** Your own throw is drawn back all the way: let go to throw (docs/dev/items.md). */
	'throw.ready': { synth: { kind: 'click' }, category: 'sfx', volume: 0.3, rate: 0.8 },
	'brick.break': {
		synth: { kind: 'crack' },
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'brick shatters'
	},
	'item.pickup': {
		file: 'item.pickup',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.3,
		variation: 0.1
	},
	'item.drop': {
		file: 'item.drop',
		synth: { kind: 'thud', cutoff: 700 },
		category: 'sfx',
		volume: 0.25,
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
		file: 'crate.open',
		synth: { kind: 'thud', cutoff: 500 },
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'a lid creaks open',
		captionOthers: true
	},
	// A door between levels: the bar thrown off, then the leaves dragging open on old hinges.
	'door.unbar': {
		synth: { kind: 'thud', cutoff: 700 },
		category: 'sfx',
		volume: 0.9,
		variation: 0.05,
		caption: 'a heavy bar drops',
		captionOthers: true
	},
	'door.open': {
		file: 'door.open',
		synth: { kind: 'groan' },
		category: 'sfx',
		volume: 1,
		variation: 0.05,
		caption: 'a great door groans open',
		captionOthers: true
	},
	// The rite slams the final room's door shut and bars it, until what it summoned is banished.
	'door.slam': {
		file: 'door.open',
		synth: { kind: 'thud', cutoff: 400 },
		category: 'sfx',
		volume: 1,
		rate: 1.6,
		variation: 0.05,
		caption: 'the door slams shut',
		captionOthers: true
	},
	'door.seal': {
		synth: { kind: 'thud', cutoff: 500 },
		category: 'sfx',
		volume: 1,
		variation: 0.05,
		caption: 'a bar drops across the door',
		captionOthers: true
	},
	// The final room's way out, let down once the Affliction is resolved.
	'ladder.lower': {
		synth: { kind: 'groan' },
		category: 'sfx',
		volume: 0.9,
		rate: 1.3,
		variation: 0.05,
		caption: 'a ladder rattles down',
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
		file: 'chalk',
		synth: { kind: 'scrape' },
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'chalk scratches on stone',
		captionOthers: true
	},
	'chalk.rub': {
		file: 'chalk',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.4,
		rate: 0.7,
		variation: 0.1,
		caption: 'chalk is rubbed away',
		captionOthers: true
	},
	// Ropes and falls (docs/dev/rope.md).
	/** A rope taking weight: every half metre someone climbs, and as they take hold. */
	'rope.tension': {
		file: 'rope.tension',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.55,
		variation: 0.12,
		caption: 'a rope creaks',
		captionOthers: true
	},
	'rope.grab': {
		file: 'rope.tension',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.4,
		rate: 1.25,
		variation: 0.1
	},
	/** Letting go of a rope, or slipping off it. */
	'rope.letgo': {
		synth: { kind: 'whoosh' },
		category: 'sfx',
		volume: 0.5,
		variation: 0.1,
		caption: 'someone lets go of the rope',
		captionOthers: true
	},
	/** Knotting a rope to an anchor, untying it, gathering it up. */
	'rope.tie': {
		file: 'rope.tie',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.6,
		variation: 0.06,
		caption: 'rope is knotted',
		captionOthers: true
	},
	/** Paying rope out along the floor (every couple of metres laid). */
	'rope.payout': {
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.25,
		rate: 0.8,
		variation: 0.15
	},
	/** Landing from a fall that hurt; `hard` from high up. */
	'fall.land': {
		synth: { kind: 'thud', cutoff: 320 },
		category: 'sfx',
		volume: 0.9,
		variation: 0.08,
		caption: 'someone falls heavily',
		captionOthers: true
	},
	'fall.land.hard': {
		synth: { kind: 'thud', cutoff: 180 },
		category: 'sfx',
		volume: 1,
		variation: 0.05,
		caption: 'a body hits the stone',
		captionOthers: true
	},
	/** A hobbling fall: the grunt of it. */
	'condition.hobble': {
		file: 'exertion',
		synth: { kind: 'hurt' },
		category: 'sfx',
		volume: 0.7,
		rate: 0.85,
		variation: 0.06
	},
	// The map (docs/dev/map.md): the notebook opened and shut, the pencil, and a map shown.
	'map.open': {
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.35,
		rate: 1.2,
		variation: 0.1
	},
	'map.close': {
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.3,
		rate: 0.9,
		variation: 0.1
	},
	'map.sketch': {
		synth: { kind: 'scrape' },
		category: 'sfx',
		volume: 0.35,
		rate: 1.6,
		variation: 0.15,
		caption: 'a pencil scratches',
		captionOthers: true
	},
	'map.show': {
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.45,
		variation: 0.1,
		caption: 'pages turn',
		captionOthers: true
	},
	// The surface.
	/** Moving between pages (the tabs, the store, social, settings). */
	'ui.nav': { file: 'ui.nav', synth: { kind: 'click' }, category: 'sfx', volume: 0.2 },
	/** Pressing a button in a menu: a click, a key, or the controller's A. */
	'ui.button': { file: 'ui.button', synth: { kind: 'click' }, category: 'sfx', volume: 0.6 },
	/** The controller moving the focus in a menu (docs/dev/controller.md): the move, quieter. */
	'ui.focus': { file: 'ui.nav', synth: { kind: 'click' }, category: 'sfx', volume: 0.15 },
	/** The controller's right stick stepping a value in a menu (the store's quantity): lower. */
	'ui.step': {
		file: 'ui.nav',
		synth: { kind: 'click' },
		category: 'sfx',
		volume: 0.15,
		rate: 0.85
	},
	/** A controller button held in a menu pressed its control (Launch, the store): a button press. */
	'ui.hold': { file: 'ui.button', synth: { kind: 'click' }, category: 'sfx', volume: 0.6 },
	/**
	 * Hiding or showing the rite panel underground (docs/dev/rite.md), and the admin free camera
	 * (docs/dev/map-generation.md#debug-grid): a quiet tick.
	 */
	'ui.toggle': {
		file: 'ui.click',
		synth: { kind: 'click' },
		category: 'sfx',
		volume: 0.45,
		rate: 1.3
	},
	/** An alert sliding in at the right edge (docs/dev/alerts.md): a soft, short chime. */
	'ui.alert': {
		synth: { kind: 'bell', pitch: 988, length: 0.45 },
		category: 'sfx',
		volume: 0.3
	},
	// Stingers on the music bus (dry: no muffling or reverb from where you stand).
	'expedition.intro': { file: 'expedition.intro', category: 'music', volume: 0.8 },
	'expedition.outro': { file: 'expedition.outro', category: 'music', volume: 0.5 },
	/**
	 * Music while the Gloaming's manifestation is in the world, from the rite to its banishing
	 * (AfflictionDef.manifestation.music), looped under the fight.
	 */
	'music.gloaming.fight': { file: 'music.gloaming.fight', category: 'music', volume: 0.35 },
	/** Finding something epic, legendary or a quest item (revealed in a crate, or picked up). */
	'loot.found': { file: 'loot.found', category: 'music', volume: 0.65 },
	'shop.buy': { synth: { kind: 'click' }, category: 'sfx', volume: 0.6 },
	'shop.sell': {
		file: 'shop.sell',
		synth: { kind: 'bell', pitch: 1320, length: 0.5 },
		category: 'sfx',
		volume: 0.5
	},
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
	// The rite performed: it summons the manifestation (the fight music follows).
	'rite.perform': {
		synth: { kind: 'bell', pitch: 131, length: 4 },
		category: 'sfx',
		volume: 0.8,
		caption: 'a bell, and something stirs'
	},
	// What the rite summoned is banished: the Affliction is resolved, the fight won (a stinger).
	'rite.resolve': {
		file: 'fight.won',
		synth: { kind: 'bell', pitch: 98, length: 7 },
		category: 'music',
		volume: 0.8
	},
	// Your head under the water: a dull, close pressure under the muffled world (looped).
	'underwater.drone': {
		synth: { kind: 'drone', pitch: 52 },
		category: 'ambience',
		volume: 0.35
	},
	// Its swing, from the wind-up: it builds to the blow, so there's a moment to get out of reach.
	'manifest.windup': {
		file: 'manifest.attack',
		synth: { kind: 'snarl' },
		category: 'sfx',
		volume: 0.67,
		caption: 'a rising snarl'
	},
	// A strobe caught it: it reels, dazzled.
	'manifest.stun': {
		file: 'manifest.stun',
		synth: { kind: 'hiss' },
		category: 'sfx',
		volume: 0.5,
		caption: 'it shrieks, dazzled'
	},
	// Its ray gathering at its hands: lower and slower than its swing, building to the strike.
	'manifest.cast': {
		file: 'manifest.attack',
		synth: { kind: 'snarl' },
		category: 'sfx',
		volume: 0.6,
		rate: 0.7,
		caption: 'a low, gathering hiss'
	},
	// Its ray striking: a dark rush of air where it left it...
	'manifest.ray': {
		synth: { kind: 'whoosh' },
		category: 'sfx',
		volume: 0.8,
		rate: 0.45,
		caption: 'something dark tears through the air'
	},
	// ...and a cold crack where it struck, on stone or on someone.
	'manifest.ray.hit': {
		synth: { kind: 'crack' },
		category: 'sfx',
		volume: 0.55,
		rate: 0.6,
		variation: 0.1,
		caption: 'a cold crack'
	},
	// It breaks into a charge, running someone down: the witch's burst, deeper.
	'manifest.rush': {
		file: 'creature.burst',
		synth: { kind: 'rush' },
		category: 'sfx',
		volume: 0.8,
		rate: 0.75,
		caption: 'it shrieks and charges'
	},
	// It goes into the dark, and comes back from it somewhere else.
	'manifest.vanish': {
		synth: { kind: 'whisper' },
		category: 'sfx',
		volume: 0.7,
		rate: 0.6,
		caption: 'it slips into the dark'
	},
	'manifest.return': {
		file: 'manifest.stun',
		synth: { kind: 'hiss' },
		category: 'sfx',
		volume: 0.45,
		rate: 0.75,
		caption: 'something breathes, close behind'
	},
	// Its ray hit you: your lamp gutters out, and won't come back on for a while.
	'lamp.snuffed': {
		file: 'headlamp.off',
		synth: { kind: 'click' },
		category: 'sfx',
		volume: 1,
		rate: 0.55,
		caption: 'your lamp gutters out'
	},
	// A lamp flicked on in something's face, and it was stunned.
	'strobe.flash': {
		synth: { kind: 'crack' },
		category: 'sfx',
		volume: 0.45,
		rate: 1.6,
		caption: 'a sharp flash'
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
		volume: 0.45,
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
		file: 'defense.torn',
		synth: { kind: 'rustle' },
		category: 'sfx',
		volume: 0.7,
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
	'headlamp.on': { file: 'headlamp.on', synth: { kind: 'click' }, category: 'sfx', volume: 0.9 },
	'headlamp.off': { file: 'headlamp.off', synth: { kind: 'click' }, category: 'sfx', volume: 0.9 }
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
