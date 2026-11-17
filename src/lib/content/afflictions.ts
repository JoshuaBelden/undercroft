/**
 * Affliction definitions (data): how fast the meter fills, what each omen stage does, the
 * manifestation the rite summons, and the rite. The meter is never shown to players; they read
 * it through omens.
 * See docs/dev/affliction.md.
 */

import type { AnimationMap } from './animations.ts';
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

export interface ManifestationSpec {
	/** The figure players see. Without one nothing is drawn (it is only heard). */
	body?: ManifestationBody;
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
	/** Lamp light on its core (lamp units, summed over players) that exposes it. */
	exposeLight: number;
	/** Seconds it stays exposed after the light leaves it. */
	exposeLinger: number;
	/** Damage it takes while exposed before it's banished. Unexposed, hits only slow it. */
	health: number;
	/** Seconds a hit slows it when it isn't exposed. */
	slowSeconds: number;
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
	 * room. Left out, it isn't placed at all: players bring it down or find it as loot.
	 */
	place?: 'crate' | 'room';
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
	manifestation: ManifestationSpec;
	rite: RiteSpec;
}

export const AFFLICTIONS: Record<string, AfflictionDef> = {
	gloaming: {
		id: 'gloaming',
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
			// The model has no idle, crouch or crawl clip.
			body: {
				model: modelUrl('afflictions/gloaming/creatures/gloaming_boss.glb'),
				yawOffset: Math.PI,
				// 1.7 m as exported; this stands it about as tall as its hit capsule (2.2 m).
				scale: 1.3,
				animations: {
					// No idle clip yet: the walk's first frame, held.
					idle: { clip: 'Walking', speed: 0 },
					walking: { clip: 'Walking' },
					running: { clip: 'Running' },
					melee_attack: { clip: 'Charged_Upward_Slash' },
					take_damage: { clip: 'Face_Punch_Reaction' },
					die: { clip: 'Shot_and_Fall_Forward' }
				},
				strikeSeconds: 1.2,
				flinchSeconds: 0.7
			},
			gatherSeconds: 2,
			speed: 1.4,
			unlitSpeed: 2.4,
			reach: 1.6,
			// 40 solo, 50 for two, 60 for three or more.
			strikeDamage: [40, 50, 60],
			strikeAt: 0.8,
			strikeRecover: 0.8,
			// A lamp flicked off and on stuns it for 2 s; then it can't be stunned again for 20 s.
			vulnerable: ['strobe'],
			statuses: { stunned: { seconds: 2, immunity: 20 } },
			exposeLight: 0.12,
			exposeLinger: 2.5,
			health: 300,
			slowSeconds: 0.3,
			spawnDistance: 30,
			hitRadius: 1,
			hitHeight: 2.2
		},
		// Candles and chalk are bought or looted; the Pendant is in a crate (unless someone owns it).
		rite: {
			requirements: [
				{ item: 'candle', count: 5 },
				{ item: 'chalk', count: 1 },
				{ item: 'pendant', count: 1, place: 'crate' }
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
					text: 'The robbers threw his pendant in a crate with the rest of the haul.',
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
