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
	/** File name(s) in art/sfx (16-bit PCM or 32-bit float .wav, or .mp3). Several files become variants. */
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
	/**
	 * With `loopCrossfade`: keep the clip's opening as it is. It plays from its very start the
	 * first time; its end crossfades into this point (seconds into the clip), and every pass after
	 * the first loops from there. Music uses it so its opening is heard as written. Without it the
	 * end is blended into the start itself, which suits beds that have no opening.
	 */
	loopFrom?: number;
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
	// The effort grunt: pushing through a squeeze, mantling, jumping, a hobbling fall.
	{ id: 'grunt', file: 'sfx_grunt.mp3' },
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
	// Something let go of: onto the floor underground, or thrown away on the surface.
	{ id: 'item.drop', file: 'sfx_drop_item.mp3' },
	// Selling on the Loadout page.
	{ id: 'shop.sell', file: 'sfx_sell.mp3' },
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
	// Interface: hiding or showing a panel underground.
	{ id: 'ui.click', file: 'menu_click.wav' },
	// Menus: moving between pages and the focus moving; pressing a button.
	{ id: 'ui.nav', file: 'sfx_menu_nav.mp3' },
	{ id: 'ui.button', file: 'sfx_button_click.mp3' },
	// Stingers: going down at the start of an expedition, and coming up at the end of it.
	{ id: 'expedition.intro', file: 'sfx_expedition_intro.mp3', rate: 22050 },
	{ id: 'expedition.outro', file: 'sfx_extraction_outro.mp3', rate: 22050 },
	// The headlamp: running low (under 3V, once a minute), and a battery swapped in.
	{ id: 'battery.low', file: 'sfx_battery_low.mp3' },
	{ id: 'battery.charged', file: 'sfx_battery_charged.mp3' },
	// Binding a wound.
	{ id: 'bandage', file: 'sfx_bandage.mp3' },
	// The fight with the Gloaming's manifestation, looped: the track up to where it fades out.
	{
		id: 'music.gloaming.fight',
		file: 'music_gloaming_boss_fight_start.mp3',
		crop: { start: 0, length: 34 },
		loopCrossfade: 2,
		loopFrom: 0,
		keepSilence: true
	},
	// The Gloaming's manifestation: its swing (from the wind-up; it peaks as the blow lands) and
	// its shriek when a strobe stuns it.
	{ id: 'manifest.attack', file: 'sfx_gloaming_boss_attack.mp3' },
	{ id: 'manifest.stun', file: 'sfx_gloaming_boss_stun.mp3' },
	// What the rite summoned is banished: the fight is won.
	{ id: 'fight.won', file: 'sfx_boss_fight_won.mp3' },
	// Finding something epic, legendary or a quest item.
	{ id: 'loot.found', file: 'sfx_happy_cue.mp3' },
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
	// The surface: the bed under the dashboard and every page off the expedition, looped.
	{
		id: 'ambience.dashboard',
		file: 'ambient_dashboard.mp3',
		loopCrossfade: 2,
		keepSilence: true
	},
	{
		id: 'ambience.horror',
		file: 'horror_ambient.mp3',
		crop: { start: 4, length: 12 },
		rate: 22050
	},
	// Creatures: a witch's steps (one file per step), the rush when it bursts at you, its attack.
	{
		id: 'creature.step',
		file: 'sfx_creature_footsteps.mp3',
		slice: { minGap: 0.3, maxLength: 0.45, threshold: 0.3, maxClips: 8 }
	},
	{ id: 'creature.burst', file: 'jump-scare.mp3' },
	{ id: 'creature.attack', file: 'sfx_witch_attack.mp3' },
	{ id: 'creature.die', file: 'sfx_witch_death.mp3' },
	// Going through a corpse's things.
	{ id: 'corpse.search', file: 'bag_searching.wav' },
	// A creature's breathing, looped; heard close by (see Creatures.ts).
	{ id: 'creature.breath', file: 'sfx_witch_breathing.mp3', loopCrossfade: 0.5, keepSilence: true },
	// A crate's lid lifting.
	{ id: 'crate.open', file: 'drawer_open.wav' },
	// A door between levels dragging open.
	{ id: 'door.open', file: 'sfx_door_open.mp3' },
	// Something taken off the floor into the pack.
	{ id: 'item.pickup', file: 'zipper_bag.wav' },
	// Chalk on stone (drawn, and slowed down for rubbing a mark out).
	{ id: 'chalk', file: 'writing.wav' },
	// Worn protection torn apart.
	{ id: 'defense.torn', file: 'velcro.wav' },
	{ id: 'creature.hurt', file: 'witch-growl.mp3' },
	// A rope taking a climber's weight (played as they go up or down it).
	{ id: 'rope.tension', file: 'sfx_rope_tension.mp3' },
	// Knotting a rope to an anchor, untying it, coiling it up.
	// The recording runs 13.7 s; tying takes a few seconds, so only its start.
	{ id: 'rope.tie', file: 'sfx_rope_tying.mp3', crop: { start: 0, length: 3.5 } },
	// Levering at a jammed crate or a wall with a crowbar (played as the prying starts; cut short
	// when the prying stops).
	{ id: 'crowbar.pry', file: 'sfx_metal_pry.mp3' },
	// The crowbar's own swing: the recording is 1.6 s of swing and a second and a half of silence.
	{ id: 'crowbar.swing', file: 'sfx_crowbar_attack.mp3', crop: { start: 0, length: 1.6 } },
	// A false wall coming down under the crowbar.
	{ id: 'crowbar.rocks', file: 'sfx_crowbar_rocks.mp3' },
	// A key turning in a trunk's lock.
	{ id: 'key.unlock', file: 'sfx_key_unlock.mp3' },
	// Pencil on paper: sketching the map.
	{ id: 'map.scribble', file: 'sfx_scribble.mp3' },
	// The gear, crafting and loot round's weapons and tools.
	{ id: 'crossbow.shot', file: 'crossbow.shot.mp3' },
	// The crank runs 11 s; reloading takes 2.5.
	{ id: 'crossbow.crank', file: 'crossbow.crank.mp3', crop: { start: 0, length: 2.5 } },
	{ id: 'rifle.shot', file: 'rifle.shot.mp3' },
	{ id: 'rifle.bolt', file: 'rifle.bolt.mp3' },
	{ id: 'rifle.load', file: 'rifle.load.mp3' },
	{ id: 'hatchet.hit', file: 'hatchet.hit.mp3' },
	{ id: 'spade.hit', file: 'spade.hit.mp3' },
	{ id: 'spear.thrust', file: 'spear.thrust.mp3' },
	// Every swing (the knife and crowbar's `melee.swing`, and each weapon's own swing, pitched).
	{ id: 'swoosh', file: 'swoosh.mp3' },
	{ id: 'slingshot.shot', file: 'slingshot.shot.mp3' },
	{ id: 'oilbottle.shatter', file: 'oilbottle.shatter.mp3' },
	// The fuse burns 4 s.
	{ id: 'firecrackers.fuse', file: 'firecracker.fuse.mp3', crop: { start: 0, length: 4 } },
	{ id: 'firecrackers.bang', file: 'firecrackers.bang.mp3' },
	{ id: 'tripwire.ring', file: 'tripwire.ring.mp3' },
	{ id: 'whistle.blow', file: 'whistle.blow.mp3' },
	// Hammering a piton in takes 2 s; the recording runs nearly 10.
	{ id: 'piton.hammer', file: 'piton.hammer.mp3', crop: { start: 0, length: 2 } },
	{ id: 'laudanum.drink', file: 'drink.mp3' },
	// Mending and breaking down at the Workshop.
	{ id: 'workshop.repair', file: 'workshop.repair.mp3' },
	{ id: 'workshop.salvage', file: 'item.salvage.mp3' },
	// The skill tree (docs/dev/progression.md).
	{ id: 'skills.unlock', file: 'skills.unlock.mp3' },
	{ id: 'skills.rank', file: 'skills.rank.mp3' },
	{ id: 'skills.mastered', file: 'skills.mastered.mp3' },
	{ id: 'skills.denied', file: 'skills.denied.mp3' },
	// Quests (docs/dev/quests.md). Room tasks play their sound once each `every` seconds while
	// worked, so each is cut to about that long and the pulses run on into one another.
	{ id: 'quest.commit', file: 'quest.commit.mp3' },
	{ id: 'quest.done', file: 'quest.done.mp3' },
	{ id: 'task.bell', file: 'task.bell.mp3' },
	// Three blows, 0.6 s apart: the next pulse (every 2 s) keeps the rhythm.
	{ id: 'task.hammer', file: 'task.hammer.mp3', crop: { start: 0.15, length: 1.75 } },
	{ id: 'task.scrape', file: 'task.scrape.mp3', crop: { start: 0.5, length: 2.1 } },
	// The haul itself, without the second and a half of nothing before it.
	{ id: 'task.winch', file: 'task.winch.mp3', crop: { start: 1.4, length: 2.6 } },
	// The hard shake of the bar, not the first tentative tug or the long settle after.
	{ id: 'door.rattle', file: 'door.rattle.mp3', crop: { start: 2.0, length: 2.8 } },
	{ id: 'charge.fuse', file: 'charge.fuse.mp3' },
	{ id: 'charge.blast', file: 'charge.blast.mp3' },
	{ id: 'lantern.laid', file: 'lantern.laid.mp3' },
	// Fontaine's greetings (NpcDef.voice): four lines, one played at random.
	{
		id: 'fontaine.voice',
		file: [
			'fontaine.voice.1.wav',
			'fontaine.voice.2.wav',
			'fontaine.voice.3.wav',
			'fontaine.voice.4.wav'
		]
	}
];
