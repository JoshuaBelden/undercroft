import type { AnimSlot, AnimationMap } from './animations.ts';
import type { MovementTuning } from './player/movement.ts';
import { MOVEMENT } from './player/movement.ts';
import { modelUrl } from './models.ts';

/**
 * Creature definitions. "Creature" is the code/doc name; never name them in game text.
 * See docs/dev/creatures.md.
 */

/** The animation slot a creature is in, as the server sends it. See content/animations.ts. */
export type CreatureAnim = AnimSlot;

export interface CreatureDef {
	id: string;
	model: string;
	/** Model faces +Z in its file; the game faces -Z at yaw 0, so it's turned by this much. */
	yawOffset: number;
	/** Body height (m): visibility samples and the client marker. */
	height: number;
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
	};
	health: number;
	/** A hit at least this hard staggers it: an attack not yet landed is cancelled. */
	stagger: { threshold: number; seconds: number };
	/** Body radius for hits (m). */
	hitRadius: number;
	/** Seconds a dead creature stays before it's removed. */
	corpseTime: number;
	/**
	 * Visible only when the light on it is within this band (lamp units). A finite upper bound hides
	 * it in full light too (half-light); Infinity means any light above the lower bound shows it.
	 */
	visibleBand: [number, number];
	/** Its breathing is heard within this distance (m), through walls. */
	breath: { range: number };
	/**
	 * How many spawn per expedition, and how far (m, along the nav grid) from the start. They spawn
	 * at creature-* markers, or in corners where a map has too few. One that is killed comes back
	 * `respawnSeconds` later, at least `minDistance` from every player.
	 */
	spawn: { count: [number, number]; minDistance: number; respawnSeconds: number };
}

export const CREATURES: Record<string, CreatureDef> = {
	witch: {
		id: 'witch',
		model: modelUrl('shared/creatures/witch.glb'),
		yawOffset: Math.PI,
		height: 1.7,
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
		attack: { range: 1.6, windup: 0.5, duration: 1.4, damage: 30, cooldown: 1.6 },
		perception: {
			hear: { sprint: 12, walk: 6, crouch: 3, crawl: 2, creep: 1.5, swim: 7 },
			alertRange: 14,
			agro: { litRange: 10, darkRange: 3.5 },
			touch: 2.5,
			evadeTime: 6
		},
		health: 120,
		stagger: { threshold: 20, seconds: 0.5 },
		hitRadius: 0.35,
		corpseTime: 4,
		// Seen in any light but the faintest; a bright lamp doesn't hide it.
		visibleBand: [0.04, Infinity],
		breath: { range: 6 },
		spawn: { count: [3, 5], minDistance: 25, respawnSeconds: 300 }
	}
};

export const DEFAULT_CREATURE = CREATURES.witch;
