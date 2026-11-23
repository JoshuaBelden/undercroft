import type { AudioCategory } from './categories.ts';

/**
 * Sound registry. A sound plays a built recording (`file`: an id from `pnpm asset:audio`, see
 * scripts/audio.config.ts). One with no recording built (or no `file` yet) plays nothing and
 * shows as missing on the admin Art & Assets page. Sounds are never synthesized in code: every
 * one is a recording. See docs/dev/player.md.
 */

export interface SoundDef {
	/** Built recording id(s) (AUDIO_FILES); a random variant of all of them plays each time. */
	file?: string | string[];
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

export const SOUNDS = {
	// One walking recording, pitched per surface.
	'footstep.stone': {
		file: 'footstep.walk',
		category: 'sfx',
		volume: 0.55,
		variation: 0.06
	},
	'footstep.rock': {
		file: 'footstep.walk',
		category: 'sfx',
		volume: 0.55,
		rate: 0.9,
		variation: 0.06
	},
	'footstep.tile': {
		file: 'footstep.walk',
		category: 'sfx',
		volume: 0.5,
		rate: 1.1,
		variation: 0.05
	},
	'footstep.marble': {
		file: 'footstep.walk',
		category: 'sfx',
		volume: 0.5,
		rate: 1.18,
		variation: 0.05
	},
	'footstep.run': {
		file: 'footstep.run',
		category: 'sfx',
		volume: 0.6,
		variation: 0.06
	},
	'footstep.wade': {
		file: 'water.splash',
		category: 'sfx',
		volume: 0.5,
		variation: 0.1
	},
	'swim.stroke': {
		file: 'water.slosh',
		category: 'sfx',
		volume: 0.35,
		rate: 1.15,
		variation: 0.12
	},
	'water.enter': {
		file: 'water.slosh',
		category: 'sfx',
		volume: 0.9,
		rate: 0.85,
		variation: 0.05
	},
	mantle: {
		file: 'grunt',
		category: 'sfx',
		volume: 0.6,
		variation: 0.06
	},
	// Leaving the floor in a jump (PlayerAudio.updateJump): a short breath out, quieter than a mantle.
	jump: {
		file: 'grunt',
		category: 'sfx',
		volume: 0.3,
		rate: 1.15,
		variation: 0.08
	},
	'squeeze.grunt': {
		file: 'grunt',
		category: 'sfx',
		volume: 0.45,
		variation: 0.1
	},
	// A sharp breath as you come out of a squeeze (PlayerAudio.updateSqueeze).
	gasp: { file: 'gasp', category: 'sfx', volume: 0.8 },
	// Breathing loops, crossfaded by stamina.
	'breath.slow': {
		file: 'breath.slow',
		category: 'sfx',
		volume: 0.5
	},
	'breath.fast': {
		file: 'breath.fast',
		category: 'sfx',
		volume: 0.7
	},
	// Ambience (played around the listener by Ambience.ts).
	'ambience.drip': {
		file: 'ambience.drip',
		category: 'ambience',
		volume: 0.6,
		variation: 0.25
	},
	'ambience.knock': {
		file: 'ambience.knock',
		category: 'ambience',
		volume: 0.8,
		variation: 0.1,
		caption: 'distant knocking'
	},
	'ambience.rockfall': {
		file: 'ambience.rockfall',
		category: 'ambience',
		volume: 0.4,
		variation: 0.1,
		caption: 'stones falling, far off'
	},
	'ambience.creak': {
		file: 'ambience.creak',
		category: 'ambience',
		volume: 0.8,
		variation: 0.08,
		caption: 'the rock groans'
	},
	'ambience.lap': {
		file: 'ambience.lap',
		category: 'ambience',
		volume: 0.5
	},
	/** The bed under the dashboard and every page off the expedition (FadingLoop.ts, from the root layout), looped. */
	'ambience.dashboard': { file: 'ambience.dashboard', category: 'ambience', volume: 0.5 },
	// Rare unsettling ambient swells, played at random times (not placed in the world).
	'ambience.creepy': {
		file: ['ambience.creepy', 'ambience.horror'],
		category: 'ambience',
		volume: 0.6,
		caption: 'something moans in the deep'
	},
	// Creatures (played at their position: you hear what you can't see).
	'creature.step': {
		file: 'creature.step',
		category: 'sfx',
		volume: 0.8,
		variation: 0.15,
		caption: 'shuffling steps'
	},
	// The jump scare: at most once every BURST_SOUND_GAP seconds per creature (Creatures.ts).
	'creature.burst': {
		file: 'creature.burst',
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'something rushes'
	},
	'creature.attack': {
		file: 'creature.attack',
		category: 'sfx',
		volume: 0.9,
		variation: 0.08,
		caption: 'snarl'
	},
	// Looped; louder the closer the nearest creature is (within its breath.range).
	'creature.breath': {
		file: 'creature.breath',
		category: 'sfx',
		volume: 0.8,
		caption: 'ragged breathing nearby'
	},
	'creature.hurt': {
		file: 'creature.hurt',
		category: 'sfx',
		volume: 0.7,
		variation: 0.1,
		caption: 'pained shriek'
	},
	'creature.die': {
		file: 'creature.die',
		category: 'sfx',
		volume: 0.5,
		caption: 'dying rattle'
	},
	// Rats (placeholders until there are recordings).
	'rat.step': {
		category: 'sfx',
		volume: 0.45,
		variation: 0.2,
		caption: 'skittering claws'
	},
	'rat.squeak': {
		category: 'sfx',
		volume: 0.5,
		variation: 0.2,
		caption: 'squeaking'
	},
	'rat.bite': {
		category: 'sfx',
		volume: 0.7,
		variation: 0.15,
		caption: 'a rat bites'
	},
	'rat.die': {
		category: 'sfx',
		volume: 0.5,
		caption: 'a squeal cut short'
	},
	// Spiders (placeholders until there are recordings).
	'spider.step': {
		category: 'sfx',
		volume: 0.35,
		variation: 0.25,
		caption: 'many legs'
	},
	'spider.hiss': {
		category: 'sfx',
		volume: 0.6,
		variation: 0.2,
		caption: 'a hiss'
	},
	'spider.die': {
		category: 'sfx',
		volume: 0.4,
		variation: 0.2,
		caption: 'a crunch'
	},
	'spider.giant.step': {
		category: 'sfx',
		volume: 0.8,
		rate: 0.6,
		variation: 0.15,
		caption: 'heavy legs on stone'
	},
	'spider.giant.hiss': {
		category: 'sfx',
		volume: 0.9,
		rate: 0.7,
		variation: 0.1,
		caption: 'a deep hiss'
	},
	// The surveyor sharing his map: paper unfolding (placeholder until there's a recording).
	'surveyor.share': {
		category: 'sfx',
		volume: 0.7,
		variation: 0.1,
		caption: 'paper unfolding'
	},
	// Dwellers (placeholders until there are recordings).
	'dweller.step': {
		category: 'sfx',
		volume: 0.5,
		rate: 1.2,
		variation: 0.15,
		caption: 'soft footsteps'
	},
	'dweller.murmur': {
		category: 'sfx',
		volume: 0.5,
		variation: 0.2,
		caption: 'a murmur'
	},
	// Items and weapons.
	'revolver.fire': {
		file: 'revolver.fire',
		category: 'sfx',
		volume: 0.55,
		variation: 0.04,
		caption: 'gunshot',
		captionOthers: true
	},
	'shotgun.fire': {
		file: 'shotgun.fire',
		category: 'sfx',
		volume: 1,
		variation: 0.04,
		caption: 'shotgun blast',
		captionOthers: true
	},
	// Another explorer's shot from far away (crossfaded in with distance, see docs/dev/items.md).
	'gun.distant': {
		file: 'gun.distant',
		category: 'sfx',
		volume: 0.9,
		variation: 0.05,
		caption: 'distant gunshot'
	},
	'gun.empty': {
		file: 'gun.empty',
		category: 'sfx',
		volume: 0.6,
		variation: 0.04
	},
	// The recording runs 3.15 s; played a little fast to fit the revolver's 2.5 s reload.
	'revolver.reload': {
		file: 'revolver.reload',
		category: 'sfx',
		volume: 0.6,
		rate: 1.25
	},
	'shotgun.reload': {
		file: 'shotgun.reload',
		category: 'sfx',
		volume: 0.65
	},
	// One swoosh for every swing: each weapon's own swing pitches it (heavier is lower and slower).
	'melee.swing': {
		file: 'swoosh',
		category: 'sfx',
		volume: 0.5,
		variation: 0.15
	},
	'melee.hit': {
		category: 'sfx',
		volume: 0.7,
		variation: 0.1
	},
	'melee.hit.creature': {
		category: 'sfx',
		volume: 0.9,
		variation: 0.1
	},
	'bullet.impact': {
		category: 'sfx',
		volume: 0.5,
		variation: 0.2
	},
	'brick.throw': { category: 'sfx', volume: 0.5, rate: 0.75 },
	'brick.land': {
		category: 'sfx',
		volume: 0.9,
		variation: 0.1,
		caption: 'brick clatters'
	},
	'knife.throw': { category: 'sfx', volume: 0.4, rate: 1.3 },
	'knife.land': {
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'knife clatters'
	},
	/** Your own throw is drawn back all the way: let go to throw (docs/dev/items.md). */
	'throw.ready': { category: 'sfx', volume: 0.3, rate: 0.8 },
	'brick.break': {
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'brick shatters'
	},
	// Combat (docs/dev/combat.md): placeholders in code until each is recorded.
	// Too little stamina left to swing.
	'player.winded': {
		file: 'player.winded',
		category: 'sfx',
		volume: 0.7,
		rate: 0.85,
		variation: 0.08,
		caption: 'a gasp',
		captionOthers: true
	},
	// A weapon caught on what it hit (`melee.snag`).
	'club.snag': {
		file: 'club.snag',
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'a weapon snags'
	},
	// A creature set bleeding.
	'creature.bleed': {
		file: 'creature.bleed',
		category: 'sfx',
		volume: 0.6,
		rate: 0.7,
		variation: 0.1,
		caption: 'something bleeds'
	},
	// A snare springing shut on what stepped in it.
	'snare.spring': {
		file: 'snare.spring',
		category: 'sfx',
		volume: 0.9,
		rate: 0.6,
		variation: 0.08,
		caption: 'a snare snaps shut'
	},
	// The round's weapons and items (docs/handoff-gear-crafting-loot.md), to be recorded.
	'hatchet.swing': {
		file: 'swoosh',
		category: 'sfx',
		volume: 0.45,
		rate: 1.2,
		variation: 0.15
	},
	'hatchet.hit': {
		file: 'hatchet.hit',
		category: 'sfx',
		volume: 0.7,
		variation: 0.1
	},
	'spade.swing': {
		file: 'swoosh',
		category: 'sfx',
		volume: 0.55,
		rate: 0.8,
		variation: 0.12
	},
	'spade.hit': {
		file: 'spade.hit',
		category: 'sfx',
		volume: 0.75,
		variation: 0.1
	},
	'spear.thrust': {
		file: 'spear.thrust',
		category: 'sfx',
		volume: 0.4,
		variation: 0.1
	},
	'spear.hit': {
		file: 'spear.hit',
		category: 'sfx',
		volume: 0.65,
		variation: 0.1
	},
	'club.swing': {
		file: 'swoosh',
		category: 'sfx',
		volume: 0.5,
		rate: 0.95,
		variation: 0.15
	},
	'club.hit': {
		file: 'club.hit',
		category: 'sfx',
		volume: 0.75,
		variation: 0.1
	},
	'pickaxe.swing': {
		file: 'swoosh',
		category: 'sfx',
		volume: 0.6,
		rate: 0.7,
		variation: 0.1
	},
	'pickaxe.hit': {
		file: 'pickaxe.hit',
		category: 'sfx',
		volume: 0.85,
		variation: 0.1,
		caption: 'iron on stone',
		captionOthers: true
	},
	'sledge.swing': {
		file: 'swoosh',
		category: 'sfx',
		volume: 0.65,
		rate: 0.55,
		variation: 0.1
	},
	'sledge.hit': {
		file: 'sledge.hit',
		category: 'sfx',
		volume: 1,
		variation: 0.08,
		caption: 'a heavy blow',
		captionOthers: true
	},
	'rifle.shot': {
		file: 'rifle.shot',
		category: 'sfx',
		volume: 0.6,
		variation: 0.04,
		caption: 'rifle shot',
		captionOthers: true
	},
	'rifle.bolt': {
		file: 'rifle.bolt',
		category: 'sfx',
		volume: 0.55
	},
	'rifle.load': {
		file: 'rifle.load',
		category: 'sfx',
		volume: 0.5,
		variation: 0.1
	},
	'derringer.shot': {
		file: 'derringer.shot',
		category: 'sfx',
		volume: 0.5,
		variation: 0.05,
		caption: 'gunshot',
		captionOthers: true
	},
	'derringer.reload': {
		file: 'derringer.reload',
		category: 'sfx',
		volume: 0.55,
		rate: 1.1
	},
	'crossbow.shot': {
		file: 'crossbow.shot',
		category: 'sfx',
		volume: 0.35,
		variation: 0.08
	},
	'crossbow.crank': {
		file: 'crossbow.crank',
		category: 'sfx',
		volume: 0.5
	},
	'crossbow.hit': {
		file: 'crossbow.hit',
		category: 'sfx',
		volume: 0.6,
		variation: 0.1
	},
	'slingshot.shot': {
		file: 'slingshot.shot',
		category: 'sfx',
		volume: 0.35,
		variation: 0.1
	},
	'pebble.land': {
		file: 'pebble.land',
		category: 'sfx',
		volume: 0.55,
		variation: 0.15,
		caption: 'a pebble clatters',
		captionOthers: true
	},
	'firecrackers.fuse': {
		file: 'firecrackers.fuse',
		category: 'sfx',
		volume: 0.45,
		variation: 0.05,
		caption: 'a fuse hisses',
		captionOthers: true
	},
	'firecrackers.bang': {
		file: 'firecrackers.bang',
		category: 'sfx',
		volume: 0.7,
		variation: 0.2,
		caption: 'firecrackers',
		captionOthers: true
	},
	'salt.pour': {
		file: 'salt.pour',
		category: 'sfx',
		volume: 0.4,
		rate: 1.4,
		variation: 0.1,
		caption: 'salt pours'
	},
	'glowstick.crack': {
		file: 'glowstick.crack',
		category: 'sfx',
		volume: 0.35,
		rate: 1.6,
		variation: 0.1
	},
	'oilbottle.shatter': {
		file: 'oilbottle.shatter',
		category: 'sfx',
		volume: 0.7,
		variation: 0.1,
		caption: 'glass shatters',
		captionOthers: true
	},
	'whistle.blow': {
		file: 'whistle.blow',
		category: 'sfx',
		volume: 0.8,
		variation: 0.02,
		caption: 'a whistle',
		captionOthers: true
	},
	'tripwire.ring': {
		file: 'tripwire.ring',
		category: 'sfx',
		volume: 0.75,
		variation: 0.05,
		caption: 'a bell rings',
		captionOthers: true
	},
	'censer.swing': {
		file: 'censer.swing',
		category: 'sfx',
		volume: 0.25,
		rate: 0.6,
		variation: 0.1
	},
	'laudanum.drink': {
		file: 'laudanum.drink',
		category: 'sfx',
		volume: 0.4
	},
	'compass.open': {
		file: 'compass.open',
		category: 'sfx',
		volume: 0.35,
		rate: 1.2
	},
	'tarot.draw': {
		file: 'tarot.draw',
		category: 'sfx',
		volume: 0.35,
		rate: 1.3,
		caption: 'a card is drawn'
	},
	// The skill tree (docs/dev/progression.md).
	/** A category opened. */
	'skills.unlock': {
		file: 'skills.unlock',
		category: 'sfx',
		volume: 0.45
	},
	/** A skill raised a rank. */
	'skills.rank': {
		file: 'skills.rank',
		category: 'sfx',
		volume: 0.4
	},
	/** A skill at its top rank. */
	'skills.mastered': {
		file: 'skills.mastered',
		category: 'sfx',
		volume: 0.45
	},
	/** A long press with no point to spend (or nowhere for it to go). */
	'skills.denied': {
		file: 'skills.denied',
		category: 'sfx',
		volume: 0.4
	},
	// The Workshop and the store (docs/dev/crafting.md), to be recorded.
	'workshop.craft': {
		file: 'workshop.craft',
		category: 'sfx',
		volume: 0.6,
		rate: 1.2,
		variation: 0.1
	},
	'workshop.repair': {
		file: 'workshop.repair',
		category: 'sfx',
		volume: 0.55,
		variation: 0.1
	},
	'workshop.salvage': {
		file: 'workshop.salvage',
		category: 'sfx',
		volume: 0.6,
		variation: 0.1
	},
	'store.tier': {
		file: 'store.tier',
		category: 'sfx',
		volume: 0.4
	},
	// Making something below, kneeling (loops while it goes on).
	'craft.field': {
		file: 'craft.field',
		category: 'sfx',
		volume: 0.45,
		rate: 0.9,
		variation: 0.15,
		caption: 'tinkering'
	},
	// Rumors' training dummies (docs/dev/rumors.md), to be recorded.
	'dummy.hit': {
		file: 'dummy.hit',
		category: 'sfx',
		volume: 0.7,
		variation: 0.12,
		caption: 'a dummy is hit'
	},
	'dummy.reset': {
		file: 'dummy.reset',
		category: 'sfx',
		volume: 0.4,
		rate: 1.6,
		variation: 0.1
	},
	'dummy.track': {
		file: 'dummy.track',
		category: 'ambience',
		volume: 0.25,
		rate: 0.6
	},
	// A climbing piton hammered into the rock (docs/dev/rope.md#pitons).
	'piton.hammer': {
		file: 'piton.hammer',
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'iron rings on rock',
		captionOthers: true
	},
	// You noticed a smuggler's chalk sign: the brick beside it is loose (docs/dev/world.md).
	'stash.notice': {
		file: 'stash.notice',
		category: 'sfx',
		volume: 0.35,
		rate: 1.6,
		variation: 0.1,
		caption: 'a loose brick'
	},
	// Breaking at a rubble wall (a pickaxe), and webs torn or burned (docs/dev/world.md).
	'rubble.break': {
		file: 'rubble.break',
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'rock breaks',
		captionOthers: true
	},
	'web.tear': {
		file: 'web.tear',
		category: 'sfx',
		volume: 0.55,
		rate: 1.3,
		variation: 0.12,
		caption: 'webbing tears'
	},
	'web.burn': {
		file: 'web.burn',
		category: 'sfx',
		volume: 0.7,
		rate: 0.5,
		variation: 0.1,
		caption: 'webbing burns'
	},
	// A fire catching and burning (an oil bottle's).
	'fire.burn': {
		file: 'fire.burn',
		category: 'sfx',
		volume: 0.75,
		rate: 0.6,
		variation: 0.1,
		caption: 'fire crackles'
	},
	// A weapon or tool giving way: it is broken now, and does nothing until it is repaired.
	'item.break': {
		file: 'item.break',
		category: 'sfx',
		volume: 0.7,
		rate: 0.8,
		variation: 0.08,
		caption: 'something breaks'
	},
	'item.pickup': {
		file: 'item.pickup',
		category: 'sfx',
		volume: 0.3,
		variation: 0.1
	},
	'item.drop': {
		file: 'item.drop',
		category: 'sfx',
		volume: 0.25,
		variation: 0.15,
		caption: 'something dropped',
		captionOthers: true
	},
	// The Affliction.
	'omen.drone': {
		category: 'ambience',
		volume: 0.6,
		caption: 'low hum'
	},
	// Putting something down in a slot: the Loadout page and the pack screen.
	'inventory.drop': {
		file: 'inventory.drop',
		category: 'sfx',
		volume: 0.35,
		variation: 0.12
	},
	// Going through a loot crate: once for each thing as it starts to be revealed.
	'inventory.rummage': {
		file: 'inventory.rummage',
		category: 'sfx',
		volume: 0.4,
		variation: 0.1,
		caption: 'rummaging',
		captionOthers: true
	},
	// The lid of a loot crate, the first time it is lifted.
	// A jammed crate or a locked trunk that won't give (docs/dev/items.md#jammed-crates).
	'crate.stuck': {
		category: 'sfx',
		volume: 0.6,
		rate: 1.4,
		variation: 0.1,
		caption: 'a lid rattles, stuck fast',
		captionOthers: true
	},
	// A key turning in a trunk's lock (used up).
	'key.unlock': {
		file: 'key.unlock',
		category: 'sfx',
		volume: 0.7,
		variation: 0.05,
		caption: 'a key turns in a lock',
		captionOthers: true
	},
	// Levering with a crowbar: a jammed crate, or the wall at a dead end. Heard far.
	'crowbar.pry': {
		file: 'crowbar.pry',
		category: 'sfx',
		volume: 0.75,
		variation: 0.04,
		caption: 'iron grinds on stone'
	},
	// The crowbar's swing: heavy iron through the air (its hit is the shared `melee.hit`).
	'crowbar.swing': {
		file: 'crowbar.swing',
		category: 'sfx',
		volume: 0.7,
		variation: 0.06
	},
	// A false wall coming down.
	'crowbar.rocks': {
		file: 'crowbar.rocks',
		category: 'sfx',
		volume: 0.9,
		variation: 0.05,
		caption: 'a wall collapses'
	},
	'crate.open': {
		file: 'crate.open',
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'a lid creaks open',
		captionOthers: true
	},
	// A door between levels: the bar thrown off, then the leaves dragging open on old hinges.
	'door.unbar': {
		category: 'sfx',
		volume: 0.9,
		variation: 0.05,
		caption: 'a heavy bar drops',
		captionOthers: true
	},
	'door.open': {
		file: 'door.open',
		category: 'sfx',
		volume: 1,
		variation: 0.05,
		caption: 'a great door groans open',
		captionOthers: true
	},
	// The rite slams the final room's door shut and bars it, until what it summoned is banished.
	'door.slam': {
		file: 'door.open',
		category: 'sfx',
		volume: 1,
		rate: 1.6,
		variation: 0.05,
		caption: 'the door slams shut',
		captionOthers: true
	},
	'door.seal': {
		category: 'sfx',
		volume: 1,
		variation: 0.05,
		caption: 'a bar drops across the door',
		captionOthers: true
	},
	// The final room's way out, let down once the Affliction is resolved.
	'ladder.lower': {
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
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'someone rummages through a pack',
		captionOthers: true
	},
	// Lootables opening (docs/dev/lootables.md): silent until each is recorded.
	'lootable.niche': {
		file: 'lootable.niche',
		category: 'sfx',
		volume: 0.5,
		variation: 0.1,
		caption: 'stone shifts in a wall',
		captionOthers: true
	},
	'lootable.bones': {
		file: 'lootable.bones',
		category: 'sfx',
		volume: 0.7,
		rate: 1.6,
		variation: 0.1,
		caption: 'bones clatter',
		captionOthers: true
	},
	'lootable.lid': {
		file: 'lootable.lid',
		category: 'sfx',
		volume: 0.8,
		rate: 1.4,
		variation: 0.08,
		caption: 'a stone lid grinds aside',
		captionOthers: true
	},
	'lootable.chest': {
		file: 'lootable.chest',
		category: 'sfx',
		volume: 0.65,
		variation: 0.1,
		caption: 'a chest is forced open',
		captionOthers: true
	},
	'lootable.locker': {
		file: 'lootable.locker',
		category: 'sfx',
		volume: 0.55,
		rate: 1.8,
		variation: 0.1,
		caption: 'a metal door creaks',
		captionOthers: true
	},
	'lootable.satchel': {
		file: 'lootable.satchel',
		category: 'sfx',
		volume: 0.45,
		variation: 0.1,
		caption: 'something is pulled from the water',
		captionOthers: true
	},
	'lootable.offering.pick': {
		file: 'lootable.offering.pick',
		category: 'sfx',
		volume: 0.4,
		variation: 0.1
	},
	'lootable.cabinet': {
		file: 'lootable.cabinet',
		category: 'sfx',
		volume: 0.5,
		rate: 1.2,
		variation: 0.1,
		caption: 'a cabinet door swings open',
		captionOthers: true
	},
	'lootable.nest': {
		file: 'lootable.nest',
		category: 'sfx',
		volume: 0.6,
		variation: 0.15,
		caption: 'rats squeal',
		captionOthers: true
	},
	'lootable.cocoon': {
		file: 'lootable.cocoon',
		category: 'sfx',
		volume: 0.55,
		rate: 0.8,
		variation: 0.1,
		caption: 'webbing tears',
		captionOthers: true
	},
	'lootable.brick': {
		file: 'lootable.brick',
		category: 'sfx',
		volume: 0.5,
		rate: 1.3,
		variation: 0.1,
		caption: 'a brick scrapes loose',
		captionOthers: true
	},
	'lootable.cache': {
		file: 'lootable.cache',
		category: 'sfx',
		volume: 0.45,
		rate: 1.2,
		variation: 0.1,
		caption: 'paper rustles',
		captionOthers: true
	},
	// Filling a bottle at a font (docs/dev/world.md#fonts).
	'lootable.font': {
		file: 'lootable.font',
		category: 'sfx',
		volume: 0.4,
		rate: 1.4,
		variation: 0.1,
		caption: 'water pours'
	},
	'lootable.alcove': {
		file: 'lootable.alcove',
		category: 'sfx',
		volume: 0.65,
		rate: 0.9,
		variation: 0.08,
		caption: 'an iron grille gives way',
		captionOthers: true
	},
	// Chalk on stone: a mark drawn, or rubbed out by whoever drew it.
	'chalk.draw': {
		file: 'chalk',
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'chalk scratches on stone',
		captionOthers: true
	},
	'chalk.rub': {
		file: 'chalk',
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
		category: 'sfx',
		volume: 0.55,
		variation: 0.12,
		caption: 'a rope creaks',
		captionOthers: true
	},
	'rope.grab': {
		file: 'rope.tension',
		category: 'sfx',
		volume: 0.4,
		rate: 1.25,
		variation: 0.1
	},
	/** Letting go of a rope, or slipping off it. */
	'rope.letgo': {
		category: 'sfx',
		volume: 0.5,
		variation: 0.1,
		caption: 'someone lets go of the rope',
		captionOthers: true
	},
	/** Knotting a rope to an anchor, untying it, gathering it up. */
	'rope.tie': {
		file: 'rope.tie',
		category: 'sfx',
		volume: 0.6,
		variation: 0.06,
		caption: 'rope is knotted',
		captionOthers: true
	},
	/** Paying rope out along the floor (every couple of metres laid). */
	'rope.payout': {
		category: 'sfx',
		volume: 0.25,
		rate: 0.8,
		variation: 0.15
	},
	/** Landing from a fall that hurt; `hard` from high up. */
	'fall.land': {
		category: 'sfx',
		volume: 0.9,
		variation: 0.08,
		caption: 'someone falls heavily',
		captionOthers: true
	},
	'fall.land.hard': {
		category: 'sfx',
		volume: 1,
		variation: 0.05,
		caption: 'a body hits the stone',
		captionOthers: true
	},
	/** A hobbling fall: the grunt of it. */
	'condition.hobble': {
		file: 'grunt',
		category: 'sfx',
		volume: 0.7,
		rate: 0.85,
		variation: 0.06
	},
	// The map (docs/dev/map.md): the notebook opened and shut, the pencil, and a map shown.
	'map.open': {
		category: 'sfx',
		volume: 0.35,
		rate: 1.2,
		variation: 0.1
	},
	'map.close': {
		category: 'sfx',
		volume: 0.3,
		rate: 0.9,
		variation: 0.1
	},
	'map.sketch': {
		file: 'map.scribble',
		category: 'sfx',
		volume: 0.35,
		rate: 1.6,
		variation: 0.15,
		caption: 'a pencil scratches',
		captionOthers: true
	},
	'map.show': {
		category: 'sfx',
		volume: 0.45,
		variation: 0.1,
		caption: 'pages turn',
		captionOthers: true
	},
	// The surface.
	/** Moving between pages (the tabs, the store, social, settings). */
	'ui.nav': { file: 'ui.nav', category: 'sfx', volume: 0.2 },
	/** Pressing a button in a menu: a click, a key, or the controller's A. */
	'ui.button': { file: 'ui.button', category: 'sfx', volume: 0.6 },
	/** The controller moving the focus in a menu (docs/dev/controller.md): the move, quieter. */
	'ui.focus': { file: 'ui.nav', category: 'sfx', volume: 0.15 },
	/** The controller's right stick stepping a value in a menu (the store's quantity): lower. */
	'ui.step': {
		file: 'ui.nav',
		category: 'sfx',
		volume: 0.15,
		rate: 0.85
	},
	/** A controller button held in a menu pressed its control (Launch, the store): a button press. */
	'ui.hold': { file: 'ui.button', category: 'sfx', volume: 0.6 },
	/**
	 * Hiding or showing the rite panel underground (docs/dev/rite.md), and the admin free camera
	 * (docs/dev/map-generation.md#debug-grid): a quiet tick.
	 */
	'ui.toggle': {
		file: 'ui.click',
		category: 'sfx',
		volume: 0.45,
		rate: 1.3
	},
	/** An alert sliding in at the right edge (docs/dev/alerts.md): a soft, short chime. */
	'ui.alert': {
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
	'shop.buy': { category: 'sfx', volume: 0.6 },
	// A contact greeting you as you open their page (NpcDef.voice): one of their lines at random.
	'fontaine.greeting': { file: 'fontaine.voice', category: 'sfx', volume: 0.9 },
	// Quests (docs/dev/quests.md): committing on an NPC's page, and a quest reported done.
	'quest.commit': {
		file: 'quest.commit',
		category: 'sfx',
		volume: 0.5
	},
	'quest.done': {
		file: 'quest.done',
		category: 'sfx',
		volume: 0.5
	},
	// Room tasks: what each sounds like while it's worked, over and over (heard a long way).
	'task.bell': {
		file: 'task.bell',
		category: 'sfx',
		volume: 0.9,
		variation: 0.05,
		caption: 'a great bell tolls',
		captionOthers: true
	},
	'task.winch': {
		file: 'task.winch',
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'a winch creaks',
		captionOthers: true
	},
	'task.hammer': {
		file: 'task.hammer',
		category: 'sfx',
		volume: 0.9,
		variation: 0.15,
		caption: 'hammering on brick',
		captionOthers: true
	},
	'task.scrape': {
		file: 'task.scrape',
		category: 'sfx',
		volume: 0.6,
		variation: 0.1,
		caption: 'charcoal scraping on bone',
		captionOthers: true
	},
	// The barred stair to the lowest level, and the charge that blows it.
	'door.rattle': {
		file: 'door.rattle',
		category: 'sfx',
		volume: 0.8,
		variation: 0.1,
		caption: 'the barred door rattles',
		captionOthers: true
	},
	'charge.fuse': {
		file: 'charge.fuse',
		category: 'sfx',
		volume: 0.6,
		caption: 'a long fuse hisses',
		captionOthers: true
	},
	'charge.blast': {
		file: 'charge.blast',
		category: 'sfx',
		volume: 1,
		caption: 'a blast shakes the stone',
		captionOthers: true
	},
	// His lantern laid in his tomb: the rite resolved.
	'lantern.laid': {
		file: 'lantern.laid',
		category: 'sfx',
		volume: 0.7,
		caption: 'the lantern goes out',
		captionOthers: true
	},
	'shop.sell': {
		file: 'shop.sell',
		category: 'sfx',
		volume: 0.5
	},
	// The rite.
	'clue.sting': {
		category: 'sfx',
		volume: 0.5,
		caption: 'a clear, small chime'
	},
	'rite.begin': {
		category: 'sfx',
		volume: 0.6,
		caption: 'a low bell'
	},
	// The rite performed: it summons the manifestation (the fight music follows).
	'rite.perform': {
		category: 'sfx',
		volume: 0.8,
		caption: 'a bell, and something stirs'
	},
	// What the rite summoned is banished: the Affliction is resolved, the fight won (a stinger).
	'rite.resolve': {
		file: 'fight.won',
		category: 'music',
		volume: 0.8
	},
	// Your head under the water: a dull, close pressure under the muffled world (looped).
	'underwater.drone': {
		category: 'ambience',
		volume: 0.35
	},
	// Its swing, from the wind-up: it builds to the blow, so there's a moment to get out of reach.
	'manifest.windup': {
		file: 'manifest.attack',
		category: 'sfx',
		volume: 0.67,
		caption: 'a rising snarl'
	},
	// A strobe caught it: it reels, dazzled.
	'manifest.stun': {
		file: 'manifest.stun',
		category: 'sfx',
		volume: 0.5,
		caption: 'it shrieks, dazzled'
	},
	// Its ray gathering at its hands: lower and slower than its swing, building to the strike.
	'manifest.cast': {
		file: 'manifest.attack',
		category: 'sfx',
		volume: 0.6,
		rate: 0.7,
		caption: 'a low, gathering hiss'
	},
	// Its ray striking: a dark rush of air where it left it...
	'manifest.ray': {
		category: 'sfx',
		volume: 0.8,
		rate: 0.45,
		caption: 'something dark tears through the air'
	},
	// ...and a cold crack where it struck, on stone or on someone.
	'manifest.ray.hit': {
		category: 'sfx',
		volume: 0.55,
		rate: 0.6,
		variation: 0.1,
		caption: 'a cold crack'
	},
	// It breaks into a charge, running someone down: the witch's burst, deeper.
	'manifest.rush': {
		file: 'creature.burst',
		category: 'sfx',
		volume: 0.8,
		rate: 0.75,
		caption: 'it shrieks and charges'
	},
	// It goes into the dark, and comes back from it somewhere else.
	'manifest.vanish': {
		category: 'sfx',
		volume: 0.7,
		rate: 0.6,
		caption: 'it slips into the dark'
	},
	'manifest.return': {
		file: 'manifest.stun',
		category: 'sfx',
		volume: 0.45,
		rate: 0.75,
		caption: 'something breathes, close behind'
	},
	// Its ray hit you: your lamp gutters out, and won't come back on for a while.
	'lamp.snuffed': {
		file: 'headlamp.off',
		category: 'sfx',
		volume: 1,
		rate: 0.55,
		caption: 'your lamp gutters out'
	},
	// A lamp flicked on in something's face, and it was stunned.
	'strobe.flash': {
		category: 'sfx',
		volume: 0.45,
		rate: 1.6,
		caption: 'a sharp flash'
	},
	// Sanity.
	'player.hurt': { category: 'sfx', volume: 0.8, variation: 0.08 },
	// A blow taken by what you wear (no sanity lost), and the blow that tears it apart.
	'player.shielded': {
		category: 'sfx',
		volume: 0.7,
		variation: 0.1,
		caption: 'a muffled blow'
	},
	// A battery swapped into the headlamp.
	'battery.charged': {
		file: 'battery.charged',
		category: 'sfx',
		volume: 0.45,
		caption: 'a battery clicks into place'
	},
	// The headlamp running low (under its lowAlert volts), once a minute while it's on.
	'battery.low': {
		file: 'battery.low',
		category: 'sfx',
		volume: 0.6,
		caption: 'your headlamp beeps: battery low'
	},
	// Starting to bind a wound.
	bandage: {
		file: 'bandage',
		category: 'sfx',
		volume: 0.7,
		caption: 'linen being wound'
	},
	'defense.torn': {
		file: 'defense.torn',
		category: 'sfx',
		volume: 0.7,
		caption: 'cloth tears'
	},
	heartbeat: {
		category: 'sfx',
		volume: 0.8,
		caption: 'heartbeat'
	},
	whisper: {
		category: 'ambience',
		volume: 0.5,
		variation: 0.15,
		caption: 'whispering'
	},
	'headlamp.on': { file: 'headlamp.on', category: 'sfx', volume: 0.9 },
	'headlamp.off': { file: 'headlamp.off', category: 'sfx', volume: 0.9 }
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
