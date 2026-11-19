import type { AnimSlot, AnimationMap } from './animations.ts';
import type { SoundId } from './audio/sounds.ts';
import type { ConditionId } from './player/conditions.ts';
import type { MovementTuning } from './player/movement.ts';
import { MOVEMENT } from './player/movement.ts';
import { modelUrl } from './models.ts';
import type { StatusReactions, StatusSource } from './statuses.ts';
import type { NavReach } from '../shared/map/nav.ts';

/**
 * Creature definitions. "Creature" is the code/doc name; never name them in game text.
 * See docs/dev/creatures.md.
 */

/** The animation slot a creature is in, as the server sends it. See content/animations.ts. */
export type CreatureAnim = AnimSlot;

/** A creature's sounds; each falls back to the shared `creature.*` one. */
export type CreatureSound = 'step' | 'burst' | 'attack' | 'hurt' | 'die' | 'breath';

/**
 * How a kind comes to be in the catacombs.
 * - `attracted`: none at the start; the party's noise and light bring them (server/attraction.ts).
 * - `scatter`: placed when the map is made, in `groups` of `size`, each group within `spread` m
 *   of its first member, at least `minDistance` (along the grid) from the start. `chance` that
 *   any appear at all (default 1). `where`: anywhere it can stand, or only in corners and dead
 *   ends.
 */
export type SpawnRule =
	| { kind: 'attracted' }
	| {
			kind: 'scatter';
			groups: [number, number];
			size: [number, number];
			spread: number;
			minDistance: number;
			chance?: number;
			where: 'anywhere' | 'corner';
	  };

export interface CreatureDef {
	id: string;
	model: string;
	/** Model faces +Z in its file; the game faces -Z at yaw 0, so it's turned by this much. */
	yawOffset: number;
	/** Client: the model is drawn this much bigger (default 1) and raised this far (m). */
	scale?: number;
	lift?: number;
	/** Body height (m): visibility samples, its eyes, its reach, and the client marker. */
	height: number;
	/** Where it may go: into squeezes, crawls, water. Left out of its paths and spots otherwise. */
	reach: NavReach;
	/** Seeing it wears sanity down (see player.md#sanity). */
	dread: boolean;
	/** How much killing one feeds the Affliction meter (one per witch). */
	killWeight: number;
	/** Its own sounds, by what it's doing; the rest are the shared creature ones. */
	sounds?: Partial<Record<CreatureSound, SoundId>>;
	/** The model's animation map: its clip names by standard slot. */
	animations: AnimationMap;
	/**
	 * Which slot it is in while patrolling, holding still on alert, creeping (investigating, or
	 * closing in on someone), and bursting at them.
	 */
	gait: { patrol: CreatureAnim; alert: CreatureAnim; stalk: CreatureAnim; burst: CreatureAnim };
	movement: MovementTuning;
	/** Slow approach speed (m/s) and burst speed. */
	creepSpeed: number;
	burstSpeed: number;
	/** Seconds creeping before a burst, [min, max], and how long a burst lasts. */
	creepTime: [number, number];
	burstTime: [number, number];
	/** Patrol: wanders to random spots within `radius` (m, along the grid) of its anchor, pausing. */
	patrol: { radius: number; pause: [number, number] };
	/**
	 * Alert: holds still facing a noise or light for `wait` [min, max] seconds (more of it extends
	 * the wait, up to `maxWait`), creeps over to look, and lingers there `linger` seconds.
	 */
	alert: { wait: [number, number]; maxWait: number; linger: number };
	attack: {
		range: number;
		/** Seconds from starting the swing to the hit landing. */
		windup: number;
		/** Total seconds the attack takes before it can move again. */
		duration: number;
		damage: number;
		cooldown: number;
		/** A condition a landed hit gives (its own seconds, or the condition's). */
		condition?: { id: ConditionId; seconds?: number };
	};
	perception: {
		/** Hearing radius (m) by how the player moves. */
		hear: {
			sprint: number;
			walk: number;
			crouch: number;
			crawl: number;
			creep: number;
			swim: number;
		};
		/**
		 * Noise, or a lit lamp in front of it (in sight, or lighting it), alerts it within this
		 * distance. While it chases someone, they're lost beyond it.
		 */
		alertRange: number;
		/** Someone in sight in front of it is chased within `litRange` (lamp on) or `darkRange`. */
		agro: { litRange: number; darkRange: number };
		/** Always noticed (and chased) within this distance. */
		touch: number;
		/** Seconds without perceiving the one it chases before it gives up and patrols again. */
		evadeTime: number;
		/**
		 * It never notices anyone by itself (no alerts, no chases): only being hit sets it on
		 * someone, and then it tracks them as usual.
		 */
		passive?: boolean;
	};
	/**
	 * Damage it takes to kill, by party size: the first entry for one explorer, the next for two,
	 * and so on; the last covers any larger party.
	 */
	health: number[];
	/** A hit at least this hard staggers it: an attack not yet landed is cancelled. */
	stagger: { threshold: number; seconds: number };
	/**
	 * What causes it a status (content/statuses.ts), and how it takes each: how long it lasts on
	 * it and how long it is immune after. Stunned, it stands still and an attack not yet landed is
	 * cancelled. Left out, nothing does.
	 */
	vulnerable?: StatusSource[];
	statuses?: StatusReactions;
	/** Body radius for hits (m). */
	hitRadius: number;
	/** Seconds a dead creature stays before it's removed. */
	corpseTime: number;
	/**
	 * Visible only when the light on it is within this band (lamp units). A finite upper bound hides
	 * it in full light too (half-light); Infinity means any light above the lower bound shows it.
	 */
	visibleBand: [number, number];
	/** Its breathing is heard within this distance (m), through walls (none if left out). */
	breath?: { range: number };
	/** How it comes to be in the catacombs. Nothing comes back once killed. */
	spawn: SpawnRule;
}

/** Can't get down for squeezes or crawls, and won't go into water. */
const UPRIGHT: NavReach = { crouch: false, crawl: false, swim: false };
/** Goes anywhere: small enough for every squeeze and crawl, and swims. */
const ANYWHERE: NavReach = { crouch: true, crawl: true, swim: true };

/**
 * Movement for something small and low: as quick through a crawl as in the open (it moves with
 * the player simulation, which slows a body down for a low ceiling).
 */
function small(speed: number, sprintSpeed: number): MovementTuning {
	const stances = MOVEMENT.stances;
	return {
		...MOVEMENT,
		radius: 0.2,
		stances: {
			stand: { ...stances.stand, speed },
			crouch: { ...stances.crouch, speed },
			crawl: { ...stances.crawl, speed }
		},
		sprintSpeed,
		acceleration: 40
	};
}

export const CREATURES: Record<string, CreatureDef> = {
	witch: {
		id: 'witch',
		model: modelUrl('shared/creatures/witch.glb'),
		yawOffset: Math.PI,
		height: 1.7,
		// She never crawls, squeezes or swims: a low or flooded way is a way to lose her.
		reach: UPRIGHT,
		dread: true,
		killWeight: 1,
		// The model has no melee, jump, dodge, climb or crawl clip; those slots fall back or are
		// skipped. Its strike is the spell cast, standing in for melee_attack. Also in the file and
		// unused: 'Standard_Forward_Charge_inplace' (another run).
		animations: {
			idle: { clip: 'Idle_9' },
			walking: { clip: 'Walking', speed: 0.8 },
			running: { clip: 'Running', speed: 1.2 },
			crouch: { clip: 'Cautious_Crouch_Walk_Forward', speed: 0.9 },
			spell_attack: { clip: 'mage_soell_cast_3' },
			take_damage: { clip: 'Hit_Reaction', speed: 1.5 },
			// The clip opens with three seconds of clutching at its throat; start as it buckles.
			die: { clip: 'Strangled_and_Fall_Forward', speed: 1.8, start: 3.2 }
		},
		// It walks upright on patrol, and creeps up low.
		gait: { patrol: 'walking', alert: 'idle', stalk: 'crouch', burst: 'running' },
		movement: {
			...MOVEMENT,
			// Creatures use the player movement code with their own speeds; stance is always stand.
			stances: { ...MOVEMENT.stances, stand: { ...MOVEMENT.stances.stand, speed: 0.8 } },
			sprintSpeed: 5.5,
			acceleration: 30
		},
		creepSpeed: 0.8,
		burstSpeed: 5.5,
		creepTime: [1.2, 2.5],
		burstTime: [0.6, 1.0],
		patrol: { radius: 15, pause: [2, 6] },
		alert: { wait: [2.5, 4.5], maxWait: 8, linger: 4 },
		attack: { range: 1.6, windup: 0.5, duration: 1.4, damage: 40, cooldown: 1.6 },
		perception: {
			hear: { sprint: 12, walk: 6, crouch: 3, crawl: 2, creep: 1.5, swim: 7 },
			alertRange: 14,
			agro: { litRange: 10, darkRange: 3.5 },
			touch: 2.5,
			evadeTime: 6
		},
		// 240 solo, 290 for two, 340 for three or more.
		health: [240, 290, 340],
		stagger: { threshold: 20, seconds: 0.5 },
		hitRadius: 0.35,
		corpseTime: 4,
		// Seen in any light but the faintest; a bright lamp doesn't hide it.
		visibleBand: [0.04, Infinity],
		breath: { range: 6 },
		// Drawn by the party's noise and light (server/attraction.ts), and by omens.
		spawn: { kind: 'attracted' }
	},
	rat: {
		id: 'rat',
		model: modelUrl('shared/creatures/rat.glb'),
		yawOffset: Math.PI,
		// The model is 1.9 m nose to tail, centred on its origin.
		scale: 0.16,
		lift: 0.055,
		height: 0.25,
		reach: ANYWHERE,
		dread: false,
		killWeight: 0,
		// Clips keyed by scripts/blender/critters.py.
		animations: {
			idle: { clip: 'Idle' },
			walking: { clip: 'Walk' },
			running: { clip: 'Run' },
			melee_attack: { clip: 'Bite' },
			take_damage: { clip: 'Hurt' },
			die: { clip: 'Die' }
		},
		gait: { patrol: 'walking', alert: 'idle', stalk: 'walking', burst: 'running' },
		movement: small(1.4, 3.8),
		creepSpeed: 1.4,
		burstSpeed: 3.8,
		creepTime: [0.5, 1.2],
		burstTime: [0.8, 1.6],
		// Scurries about its nest in short dashes.
		patrol: { radius: 6, pause: [0.4, 2] },
		alert: { wait: [0.4, 1.2], maxWait: 3, linger: 2 },
		attack: { range: 0.8, windup: 0.2, duration: 0.5, damage: 6, cooldown: 1 },
		perception: {
			hear: { sprint: 10, walk: 6, crouch: 3, crawl: 2, creep: 1, swim: 6 },
			alertRange: 12,
			// Drawn to noise and light; it comes for whoever it finds there.
			agro: { litRange: 6, darkRange: 1.5 },
			touch: 1.5,
			evadeTime: 5
		},
		health: [12],
		stagger: { threshold: 1, seconds: 0.3 },
		hitRadius: 0.2,
		corpseTime: 4,
		visibleBand: [0.04, Infinity],
		sounds: {
			step: 'rat.step',
			burst: 'rat.squeak',
			attack: 'rat.bite',
			hurt: 'rat.squeak',
			die: 'rat.die'
		},
		// 4-7 nests of 1-4 about the catacombs.
		spawn: {
			kind: 'scatter',
			groups: [4, 7],
			size: [1, 4],
			spread: 3,
			minDistance: 20,
			where: 'anywhere'
		}
	}
};

/** A creature's sound for what it's doing: its own, or the shared one. */
export function creatureSound(def: CreatureDef | undefined, which: CreatureSound): SoundId {
	return def?.sounds?.[which] ?? `creature.${which}`;
}

export const DEFAULT_CREATURE = CREATURES.witch;

/** How much damage kills this creature, for a party of this size. */
export function creatureHealth(def: CreatureDef, party: number): number {
	const table = def.health;
	return table[Math.max(0, Math.min(table.length, party) - 1)] ?? 0;
}
