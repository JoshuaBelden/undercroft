/**
 * Affliction definitions (data): how fast the meter fills, what each omen stage does, the
 * manifestation the rite summons, and the rite. The meter is never shown to players; they read
 * it through omens.
 * See docs/dev/affliction.md.
 */

import type { AnimationMap } from './animations.ts';
import type { SoundId } from './audio/sounds.ts';
import { modelUrl } from './models.ts';
import type { StatusReactions, StatusSource } from './statuses.ts';

export interface OmenStage {
	/** Meter fraction (0..1) at which this stage begins. */
	at: number;
	/** Baseline lamp failure for everyone (0..1, see PlayerState.gloom). */
	gloom: number;
	/** Ambience: multipliers on distant knocks and creepy swells, whispers per minute, drone 0..1. */
	ambience: { knocks: number; swells: number; whispers: number; drone: number };
	/** Creatures perceive and hear further by this factor, and creep for less time. */
	boldness: number;
	/** Extra creatures that appear when this stage begins (far from players). */
	spawn: number;
}

/** The figure at the heart of a manifestation: a rigged model, drawn by the client. */
export interface ManifestationBody {
	model: string;
	/** Model faces +Z in its file; the game faces -Z at yaw 0, so it's turned by this much. */
	yawOffset: number;
	/** Size multiplier on the model as exported. */
	scale: number;
	/** The model's animation map: its clip names by standard slot (see content/animations.ts). */
	animations: AnimationMap;
	/** Seconds its strike animation takes (the attack clip is stretched to it). */
	strikeSeconds: number;
	/** Seconds it reels when a weapon hits it. */
	flinchSeconds: number;
}

/** How the manifestation moves on its prey (see docs/dev/affliction.md#hunting). */
export interface ManifestationMovement {
	/** Seconds ahead of the player it hunts that it aims for: where they are heading, to cut them off. */
	lead: number;
	/**
	 * When its way to them along the floor is this many times the straight distance (something
	 * between, like a table), it stops following and circles round, one way, to flank them.
	 */
	detour: number;
	/** Between these distances (m) of its prey it may circle round to come at them from the side. */
	flankRange: [number, number];
	/** Chance per second, in flank range, that it starts to; and seconds it keeps circling. */
	flankChance: number;
	flankSeconds: number;
	/** Chance after a swing that it backs off or side-steps instead of pressing in. */
	retreatChance: number;
	/** How far (m) it backs off, and for how long (s) before it comes on again. */
	retreatDistance: number;
	retreatSeconds: number;
}

/**
 * The manifestation running its prey down, like a creature's burst: now and then, in range and
 * with a clear line to them, it charges at them flat out for a moment.
 */
export interface ManifestationRush {
	/** Speed (m/s) while it charges. */
	speed: number;
	/** Seconds a charge lasts: a random time in this range (it ends early if it reaches them). */
	seconds: [number, number];
	/** Seconds of hunting between charges: a random time in this range. */
	every: [number, number];
	/** It charges at prey between these distances (m along the floor). */
	range: [number, number];
}

/**
 * The manifestation's ranged attack: a dark ray. It gathers it for `chargeSeconds` (players see
 * and hear it building), its aim following its prey until `aimLock` seconds before it fires; then
 * the ray strikes at once along that line, and whoever is on it is hit. Stepping out of the line
 * in that last moment, or putting stone between you, is how to dodge it.
 */
export interface ManifestationRay {
	/** It fires at prey between these distances (m along the floor), with a clear line to them. */
	range: [number, number];
	/** Seconds it gathers the ray (it stands, and a strobe in that time loses it). */
	chargeSeconds: number;
	/** Seconds before it fires that its aim stops following its prey. */
	aimLock: number;
	/** How far (m) from the ray's line a player's body can be and still be hit. */
	width: number;
	/** Sanity a hit takes (before what is worn absorbs), by party size like `strikeDamage`. */
	damage: number[];
	/** Seconds the lamp of whoever it hits stays out (the `snuffed` condition). */
	snuffSeconds: number;
	/** Seconds between rays: a random time in this range after each. */
	cooldown: [number, number];
}
/** The manifestation vanishing and coming back from somewhere else. */
export interface ManifestationVanish {
	/** Seconds of hunting between vanishings: a random time in this range. */
	every: [number, number];
	/** Seconds it stays gone: a random time in this range. */
	seconds: [number, number];
	/** It comes back this far (m) from the player it comes for: behind them, out of the light. */
	distance: [number, number];
	/** Seconds it stands where it came back before it hunts again. */
	returnSeconds: number;
}

export interface ManifestationSpec {
	/** The figure players see. Without one nothing is drawn (it is only heard). */
	body?: ManifestationBody;
	/**
	 * Music for the fight, looped on the music bus from the moment it is summoned until it is
	 * banished (or the expedition ends). Without one the fight has none.
	 */
	music?: SoundId;
	/** Seconds it stands where the rite summoned it before it starts hunting. */
	gatherSeconds: number;
	/** Hunting speed (m/s) with lamp light on it, and its faster speed with none. */
	speed: number;
	unlitSpeed: number;
	/** Within this distance (m, along the floor) of someone it stops and swings at them. */
	reach: number;
	/**
	 * Sanity a landed strike takes (before what is worn absorbs), by party size: the first entry
	 * for one explorer, the next for two, and so on; the last covers any larger party. There is no
	 * other damage: standing next to it between strikes costs nothing.
	 */
	strikeDamage: number[];
	/**
	 * Seconds into the swing (`body.strikeSeconds` long, or 1.2 s without a body) when the blow
	 * lands. Only those still within reach then are hit.
	 */
	strikeAt: number;
	/** Seconds it stands after a swing before it moves again. */
	strikeRecover: number;
	/** What causes it a status (see content/statuses.ts). */
	vulnerable: StatusSource[];
	/** How it takes each status: how long it lasts on it, and how long it is immune after. */
	statuses: StatusReactions;
	/**
	 * Damage it takes before it's banished, by party size (like strikeDamage). Every weapon hit
	 * counts.
	 */
	health: number[];
	/** How it closes in: cutting players off, circling round to flank, backing off. */
	movement: ManifestationMovement;
	/** Now and then it runs its prey down. */
	rush: ManifestationRush;
	/** Its ranged attack: a dark ray that puts out the lamp of whoever it hits. */
	ray: ManifestationRay;
	/** Now and then it goes, and comes back from somewhere else. */
	vanish: ManifestationVanish;
	/**
	 * The rite summons it in the rite's room. Forced out any other way (an admin), it appears at
	 * least this far (m, along the grid) from every player.
	 */
	spawnDistance: number;
	/** Hit capsule. */
	hitRadius: number;
	hitHeight: number;
}

/** The rite that resolves an Affliction. See docs/dev/rite.md. */
export interface RiteRequirement {
	item: string;
	count: number;
	/**
	 * Where the map holds it: `crate` in one of the loot crates, `room` on the floor of a major
	 * room, `altar` on the furniture in front of where the rite is performed (the Gloaming
	 * Chapel's altar, before the angel). Left out, it isn't placed at all: players bring it down or
	 * find it as loot.
	 */
	place?: 'crate' | 'room' | 'altar';
}

/** One written hint: what it says, and what it reveals (a requirement's item id, or `room`). */
export interface RiteClue {
	text: string;
	reveals: string;
}

export interface RiteSpec {
	/** What the holder must carry. */
	requirements: RiteRequirement[];
	/** Piece id of the room the rite is performed in. */
	room: string;
	/** Seconds the holder holds interact to perform it. */
	seconds: number;
	/**
	 * The hints, in the order they are learned: finding any hint item reveals the next one. Once
	 * all are found everything is known, including a requirement no hint names.
	 */
	clues: RiteClue[];
	/** Hint items placed in the map per hint (all alike: any one reveals the next hint). */
	clueCopies: number;
	/**
	 * Testing aid: put the hints in the crate nearest the start, and every required item a few
	 * steps from it, instead of out in the map.
	 */
	atStart: boolean;
}

/**
 * A training ground in place of an Affliction (Rumors, docs/dev/rumors.md): its own small map,
 * no threat, and a tutorial walked step by step. Everything used there follows the usual rules.
 */
export interface TrainingSpec {
	/** The walk in (its crate markers and spots hold the tutorial) and the vault at its end. */
	walk: string;
	vault: string;
	/** What each of the walk's crate markers holds, in order: the first time only. */
	crates: { item: string; count: number }[][];
	/** Things lying at spots: `firstTime` ones only the first time, the rest always. */
	floor: { spot: string; item: string; count: number; firstTime?: boolean }[];
	/** Training dummies at the vault's spots; `track`: metres it runs side to side. */
	dummies: { spot: string; track?: number }[];
	/**
	 * The tutorial: each step told once, when a player comes within `radius` of its spot (null:
	 * on arriving). `help` is the help topic it points to.
	 */
	steps: {
		spot: string | null;
		radius: number;
		title: string;
		line: string;
		help?: string;
		/** About what is only there the first time (the stocked crates, the kit): told only then. */
		firstTime?: boolean;
	}[];
}

export interface AfflictionDef {
	id: string;
	/** Player-facing name (results screen, help). */
	name: string;
	/** A few lines about it, shown on its pane on the Afflictions page. */
	flavor: string;
	/** The picture behind its pane: a file name (no extension) in static/assets/ui/images. */
	image: string;
	meter: {
		/** Seconds underground (with anyone inside) for time alone to fill it. */
		seconds: number;
		/** Meter added per creature killed. */
		perKill: number;
		/** Meter added per second for each unit of loot value the players carry between them. */
		perLoot: number;
	};
	/** Seconds an expedition lasts: anyone still underground when it runs out is lost. */
	expeditionSeconds: number;
	/** Omen stages, ascending by `at`. Stage 0 (no omens) is implicit below the first. */
	stages: OmenStage[];
	/** What the rite summons; none for a training ground. */
	manifestation?: ManifestationSpec;
	rite: RiteSpec;
	/** A training ground (Rumors): no meter, no creatures, nobody goes down; a tutorial. */
	training?: TrainingSpec;
	/** It stays locked until this Affliction has been done (resolved, or for training: got out of). */
	requires?: string;
	/** The order shown on the Afflictions page. */
	order: number;
}

export const AFFLICTIONS: Record<string, AfflictionDef> = {
	// The first, and a place to train after (docs/dev/rumors.md).
	rumors: {
		id: 'rumors',
		name: 'Rumors',
		order: 0,
		flavor:
			'Everyone in the village has a story about the catacombs, and none of them agree. Go down and see for yourself: a short way in, an old vault where the keepers trained, and back out. Nothing down there wants you. Yet.',
		image: 'affliction-rumors-banner',
		meter: { seconds: Infinity, perKill: 0, perLoot: 0 },
		expeditionSeconds: 3600,
		stages: [],
		rite: {
			requirements: [],
			room: 'rumors-vault',
			seconds: 0,
			clues: [],
			clueCopies: 0,
			atStart: false
		},
		training: {
			walk: 'rumors-walk',
			vault: 'rumors-vault',
			crates: [[{ item: 'rags', count: 3 }], [{ item: 'wax', count: 2 }]],
			floor: [
				{ spot: 'kit', item: 'crafting-kit', count: 1, firstTime: true },
				{ spot: 'chalk', item: 'chalk', count: 2, firstTime: true },
				// On the ledge: something to hammer in, and a rope to tie to it.
				{ spot: 'pitons', item: 'pitons', count: 2, firstTime: true },
				{ spot: 'pitons', item: 'rope-bundle', count: 1, firstTime: true }
			],
			dummies: [
				{ spot: 'dummy-5' },
				{ spot: 'dummy-10' },
				{ spot: 'dummy-20' },
				{ spot: 'dummy-40' },
				{ spot: 'track', track: 6 }
			],
			steps: [
				{
					spot: null,
					radius: 0,
					title: 'The way down',
					line: 'Climb down the rope. Your headlamp turns low and bright: brighter shows more, and is seen further.',
					help: 'headlamp'
				},
				{
					spot: 'step-crate',
					radius: 2.5,
					title: 'A crate',
					line: 'Look at it and hold interact to open it. Whatever you see inside is discovered: rags, here, and a bandage needs only rags.',
					help: 'discovery',
					firstTime: true
				},
				{
					spot: 'step-kit',
					radius: 2.5,
					title: 'A field crafting kit',
					line: 'Pick it up and wear it in a gear slot. Then open the menu, choose Craft, and make a bandage from the rags.',
					help: 'field-crafting',
					firstTime: true
				},
				{
					spot: 'step-recipe',
					radius: 2.5,
					title: 'Another crate',
					line: 'Open this one too. It holds wax but no twine: the candle recipe goes into your Library with one part still unknown, to find later.',
					help: 'discovery',
					firstTime: true
				},
				{
					spot: 'step-chalk',
					radius: 2.5,
					title: 'Chalk',
					line: 'Take the chalk in your hand and mark the wall. Marks are the only way back out.',
					help: 'chalk',
					firstTime: true
				},
				{
					spot: 'step-vault',
					radius: 7,
					title: 'The rite',
					line: 'Every Affliction ends with a rite: bring what it asks for to the room where it is done, and perform it there. Its pane says what is known; clues found below tell the rest. Rumors has none: getting out is enough.',
					help: 'the-rite'
				},
				{
					spot: 'step-vault',
					radius: 3,
					title: 'The training vault',
					line: 'Dummies at 5, 10, 20 and 40 m, one on a track. Bricks by the door. A web across one arch: swing at it to tear it down. Rubble in the other takes a pickaxe.',
					help: 'webs-and-rubble'
				},
				{
					spot: 'step-piton',
					radius: 2.5,
					title: 'A ledge',
					line: 'Nothing up there to tie a rope to. Stand at the edge facing over the drop, take a piton in your hand and hold attack to hammer it in. Then tie a rope to it with interact, and climb down.',
					help: 'pitons'
				},
				{
					spot: 'step-out',
					radius: 3,
					title: 'The way out',
					line: 'Climb the ladder to get out. After this, the Gloaming is open to you.',
					help: 'extraction'
				}
			]
		}
	},
	gloaming: {
		id: 'gloaming',
		order: 1,
		requires: 'rumors',
		name: 'The Gloaming',
		flavor:
			'Long ago, the keepers of the dead held back the dusk each evening with a rite. It worked for as long as anyone remembered how to say it. The last keeper died with the rite unspoken, and the robbers who broke into his grave took more than they knew. What he had kept shut away came down into the dark with them.',
		image: 'affliction-gloaming-banner',
		// Carrying 1000 of loot (a good haul) fills it about half as fast again as time alone.
		meter: { seconds: 1800, perKill: 0.04, perLoot: 0.0000003 },
		// Ten minutes past the latest it can arrive by time alone.
		expeditionSeconds: 2400,
		stages: [
			{
				at: 0.25,
				gloom: 0,
				ambience: { knocks: 1.6, swells: 1.5, whispers: 0, drone: 0 },
				boldness: 1.1,
				spawn: 0
			},
			{
				at: 0.5,
				gloom: 0.15,
				ambience: { knocks: 2.2, swells: 2, whispers: 0.6, drone: 0 },
				boldness: 1.2,
				spawn: 0
			},
			{
				at: 0.75,
				gloom: 0.3,
				ambience: { knocks: 2.8, swells: 2.5, whispers: 1.2, drone: 0.5 },
				boldness: 1.3,
				spawn: 1
			},
			{
				at: 0.9,
				gloom: 0.45,
				ambience: { knocks: 3.5, swells: 3, whispers: 2, drone: 0.9 },
				boldness: 1.4,
				spawn: 0
			}
		],
		manifestation: {
			music: 'music.gloaming.fight',
			body: {
				model: modelUrl('afflictions/gloaming/creatures/gloaming_boss.glb'),
				yawOffset: Math.PI,
				// 1.7 m as exported; this stands it about as tall as its hit capsule (2.2 m).
				scale: 1.3,
				// Its own walk is a mincing strut: it walks, charges, idles and casts with the witch's
				// clips, retargeted onto it at build time (scripts/retarget.ts, Borrowed_*). Its own
				// Running is unused.
				animations: {
					idle: { clip: 'Borrowed_Idle' },
					walking: { clip: 'Borrowed_Walking' },
					running: { clip: 'Borrowed_Charge' },
					// The two-handed thrust, cut before it straightens up; stretched to the charge.
					spell_attack: { clip: 'Borrowed_Cast', end: 1.4 },
					melee_attack: { clip: 'Charged_Upward_Slash' },
					take_damage: { clip: 'Face_Punch_Reaction' },
					die: { clip: 'Shot_and_Fall_Forward' }
				},
				strikeSeconds: 1.2,
				flinchSeconds: 0.7
			},
			gatherSeconds: 2,
			speed: 2.0,
			unlitSpeed: 2.8,
			reach: 1.6,
			// 40 solo, 50 for two, 60 for three or more.
			strikeDamage: [40, 50, 60],
			strikeAt: 0.8,
			strikeRecover: 0.8,
			// A lamp flicked off and on stuns it for 2 s; then it can't be stunned again for 20 s.
			vulnerable: ['strobe'],
			statuses: { stunned: { seconds: 2, immunity: 20 } },
			// Every hit counts now (no light needed): about 16 revolver shots solo.
			health: [500, 650, 800],
			movement: {
				lead: 1.2,
				detour: 1.8,
				flankRange: [3, 12],
				flankChance: 0.15,
				flankSeconds: 3,
				retreatChance: 0.4,
				retreatDistance: 5,
				retreatSeconds: 1.6
			},
			// Witch-like bursts: as fast as a sprinting explorer, a second or so at a time.
			rush: { speed: 5.5, seconds: [1.0, 1.8], every: [4, 8], range: [3, 16] },
			ray: {
				range: [4, 20],
				chargeSeconds: 1.3,
				aimLock: 0.3,
				width: 0.45,
				damage: [15, 20, 25],
				snuffSeconds: 12,
				cooldown: [7, 12]
			},
			vanish: {
				every: [25, 40],
				seconds: [3, 6],
				distance: [5, 9],
				returnSeconds: 0.8
			},
			spawnDistance: 30,
			hitRadius: 1,
			hitHeight: 2.2
		},
		// Candles and chalk are bought or looted; the Pendant lies on the chapel's altar (unless
		// someone owns it).
		rite: {
			requirements: [
				{ item: 'candle', count: 5 },
				{ item: 'chalk', count: 1 },
				{ item: 'pendant', count: 1, place: 'altar' }
			],
			room: 'gloaming-chapel',
			seconds: 5,
			clues: [
				{ text: 'He lit five candles every night, never four.', reveals: 'candle' },
				{
					text: "The keeper's line was drawn in chalk, the way you'd mark your way home.",
					reveals: 'chalk'
				},
				{
					text: "The robbers never got his pendant out. It still lies on the altar, at the angel's feet.",
					reveals: 'pendant'
				},
				{
					text: "In the Gloaming Chapel, don't look at the corner until it's done.",
					reveals: 'room'
				}
			],
			clueCopies: 3,
			atStart: false
		}
	}
};

export const DEFAULT_AFFLICTION = AFFLICTIONS.gloaming;

/** Every Affliction's id, in the order the Afflictions page shows them (Rumors first). */
export const AFFLICTION_ORDER: string[] = Object.values(AFFLICTIONS)
	.sort((a, b) => a.order - b.order)
	.map((def) => def.id);

/**
 * Whether an Affliction is still locked for someone, by what they have done (their progress):
 * one it `requires` they haven't (the Gloaming until they have got out of Rumors).
 */
export function afflictionLocked(id: string, done: (id: string) => boolean): boolean {
	const requires = AFFLICTIONS[id]?.requires;
	return !!requires && !done(requires);
}
