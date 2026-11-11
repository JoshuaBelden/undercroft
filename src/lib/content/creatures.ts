import type { MovementTuning } from './player/movement.ts';
import { MOVEMENT } from './player/movement.ts';

/**
 * Creature definitions. "Creature" is the code/doc name; never name them in game text.
 * See docs/dev/creatures.md.
 */

/** Animation states a creature can be in; the client maps each to a clip. */
export type CreatureAnim = 'idle' | 'stalk' | 'burst' | 'search' | 'attack' | 'die';

export interface CreatureDef {
	id: string;
	model: string;
	/** Model faces +Z in its file; the game faces -Z at yaw 0, so it's turned by this much. */
	yawOffset: number;
	/** Body height (m): visibility samples and the client marker. */
	height: number;
	/** Clip name per animation state, and playback speed. */
	animations: Record<CreatureAnim, { clip: string; speed: number; loop: boolean }>;
	/** Pose to hold while idle: the last frame of this clip. */
	idlePose: string;
	movement: MovementTuning;
	/** Slow approach speed (m/s) and burst speed. */
	creepSpeed: number;
	burstSpeed: number;
	/** Seconds creeping before a burst, [min, max], and how long a burst lasts. */
	creepTime: [number, number];
	burstTime: [number, number];
	/** Seconds spent searching around the last place it perceived someone before going still. */
	searchTime: number;
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
		/** A lit lamp in its line of sight (or lighting it) is noticed within this distance. */
		lampSight: number;
		/** Always noticed within this distance. */
		touch: number;
		/** Seconds without perceiving the target before giving up. */
		forget: number;
	};
	health: number;
	/** A hit at least this hard staggers it: an attack not yet landed is cancelled. */
	stagger: { threshold: number; seconds: number };
	/** Body radius for hits (m). */
	hitRadius: number;
	/** Seconds a dead creature stays before it's removed. */
	corpseTime: number;
	/** Half-light: visible only when the light on it is within this band (0..1 lamp units). */
	visibleBand: [number, number];
	/** How many spawn per expedition, and how far (m, along the nav grid) from the start. */
	spawn: { count: [number, number]; minDistance: number };
}

export const CREATURES: Record<string, CreatureDef> = {
	witch: {
		id: 'witch',
		model: '/assets/creatures/witch.glb',
		yawOffset: Math.PI,
		height: 1.7,
		animations: {
			idle: { clip: 'Arise', speed: 0, loop: false },
			stalk: { clip: 'Cautious_Crouch_Walk_Forward_inplace', speed: 0.9, loop: true },
			burst: { clip: 'run_fast_9', speed: 1.2, loop: true },
			search: { clip: 'Walking', speed: 0.8, loop: true },
			attack: { clip: 'Attack', speed: 1.6, loop: false },
			// No death clip yet: it sinks back down (Arise backwards). Negative speed plays in reverse.
			die: { clip: 'Arise', speed: -1.4, loop: false }
		},
		idlePose: 'Arise',
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
		searchTime: 14,
		attack: { range: 1.6, windup: 0.5, duration: 1.4, damage: 30, cooldown: 1.6 },
		perception: {
			hear: { sprint: 12, walk: 6, crouch: 3, crawl: 2, creep: 1.5, swim: 7 },
			lampSight: 10,
			touch: 2.5,
			forget: 12
		},
		health: 120,
		stagger: { threshold: 20, seconds: 0.5 },
		hitRadius: 0.35,
		corpseTime: 4,
		visibleBand: [0.04, 0.45],
		spawn: { count: [1, 2], minDistance: 25 }
	}
};

export const DEFAULT_CREATURE = CREATURES.witch;
