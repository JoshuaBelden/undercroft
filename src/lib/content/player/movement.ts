import type { Stance } from '../../shared/player/types.ts';

/**
 * Player movement tuning. Shared by the server simulation and client prediction, so a change
 * here changes both. See docs/dev/player.md.
 */

export interface StanceTuning {
	/** Capsule height in metres. */
	height: number;
	/** Camera height above the feet. */
	eye: number;
	/** Top speed in m/s. */
	speed: number;
	/** Distance between footsteps in metres. */
	stride: number;
	/** Footstep loudness, 0..1. */
	footstepVolume: number;
}

export interface MovementTuning {
	radius: number;
	stances: Record<Stance, StanceTuning>;
	sprintSpeed: number;
	sprintStride: number;
	/** Speed cap while sneaking (silent footsteps). */
	sneakSpeed: number;
	/** Speed cap while aiming a firearm. */
	aimSpeed: number;
	/** Speed multiplier while wading. */
	wadeSpeed: number;
	/** Top speed of a downed player dragging themselves along the floor. */
	downedSpeed: number;
	/** Speed cap inside a squeeze (vol-squeeze-* volumes); sprinting is impossible there. */
	squeezeSpeed: number;
	swim: {
		/** Capsule while swimming (body horizontal). */
		height: number;
		eye: number;
		speed: number;
		sprintSpeed: number;
		/** Water deeper than this over the feet means swimming rather than wading. */
		depth: number;
		/** Upward acceleration back toward the floating height. */
		buoyancy: number;
		/** Velocity damping per second. */
		drag: number;
		/** Eye height above the water surface when floating. */
		floatEye: number;
		/** Stamina drained per second while underwater (breath). */
		breathDrain: number;
		stride: number;
	};
	mantle: {
		/** Highest ledge (above the feet) that can be climbed on land. */
		maxHeight: number;
		/** Highest ledge above the water surface that can be climbed out of water. */
		maxFromWater: number;
		/** How far ahead to look for the ledge top. */
		reach: number;
		duration: number;
		staminaCost: number;
	};
	/** A hop on a fresh press of climb, where there is no ledge to mantle. */
	jump: {
		/** Upward speed at take-off (m/s). With gravity 18, 5 m/s rises about 0.7 m. */
		speed: number;
		/** Clear space needed above the head to jump (m). */
		headroom: number;
		staminaCost: number;
	};
	/** Horizontal acceleration toward the wanted velocity, per second. */
	acceleration: number;
	airAcceleration: number;
	gravity: number;
	/** Ledges up to this high are stepped onto. */
	stepHeight: number;
	noclipSpeed: number;
	stamina: {
		max: number;
		/** Drain per second while sprinting. */
		sprintDrain: number;
		/** Regeneration per second. */
		regen: number;
		/** Seconds after sprinting before regeneration starts. */
		regenDelay: number;
		/** After exhaustion, sprint is blocked until stamina reaches this fraction of max. */
		recoverAt: number;
	};
}

/** Climbing a rope (see docs/dev/rope.md). */
export const CLIMB = {
	/** How far (horizontal, m) from a rope it can be grabbed. */
	reach: 0.8,
	/** Grabbing it takes looking within this angle (radians) of it. */
	facing: 0.8,
	/** How far beside the rope the climber's body hangs (m). */
	hold: 0.3,
	/** Climbing speed up and down (m/s), at a full push. */
	upSpeed: 0.5,
	downSpeed: 0.65,
	/** With sprint held: hauling up faster (and harder), and sliding down. */
	fastUpSpeed: 0.95,
	slideSpeed: 2.2,
	/**
	 * Stamina per second climbing up (and faster, sprinting), down, and hanging still: it never
	 * comes back on a rope, and when it runs out you drop. A full 12 m climb up costs about 84 of
	 * 100 at the normal pace, about 113 at the fast one: too much in one go.
	 */
	upDrain: 3.5,
	fastUpDrain: 9,
	downDrain: 1.5,
	hangDrain: 0.4,
	/** Climbers on one rope stay this far apart (feet to feet, m): nobody climbs past anyone. */
	gap: 1.9,
	/** A climber whose feet are this close above the rope's foot steps off onto the floor. */
	footClearance: 0.05,
	/** Grabbing from the floor needs the feet within this of the rope's foot (m). */
	grabFromFloor: 0.6,
	/** Grabbing from the top: the feet this close to the landing, in height and across (m). */
	grabFromTop: 0.5,
	topReach: 0.9,
	/** Mounting from the top puts the feet this far below the landing. */
	topDrop: 1.4
} as const;

/** Falls: landing faster than `safeSpeed` hurts, and hobbles (see CONDITIONS). */
export const FALL = {
	/** m/s. With gravity 18, about a 2.2 m drop. */
	safeSpeed: 9,
	/** Sanity lost per m/s over `safeSpeed`: a 4 m drop costs about 27, 12 m downs you. */
	damagePerSpeed: 9,
	/** Over this speed it is a hard landing (the louder sound, the fall animation). */
	hardSpeed: 13,
	/** How far creatures hear a painful landing (m). */
	noise: 8
} as const;

export const MOVEMENT: MovementTuning = {
	radius: 0.3,
	stances: {
		stand: { height: 1.75, eye: 1.6, speed: 2.2, stride: 0.75, footstepVolume: 0.8 },
		crouch: { height: 1.2, eye: 1.05, speed: 1.3, stride: 0.6, footstepVolume: 0.45 },
		crawl: { height: 0.7, eye: 0.45, speed: 0.6, stride: 0.5, footstepVolume: 0.25 }
	},
	sprintSpeed: 4.2,
	sprintStride: 1.05,
	sneakSpeed: 1.0,
	aimSpeed: 1.4,
	wadeSpeed: 0.55,
	squeezeSpeed: 0.7,
	downedSpeed: 0.35,
	swim: {
		height: 0.9,
		eye: 0.7,
		speed: 1.6,
		sprintSpeed: 2.4,
		depth: 1.2,
		buoyancy: 6,
		drag: 3,
		floatEye: 0.12,
		breathDrain: 6,
		stride: 1.1
	},
	mantle: { maxHeight: 1.2, maxFromWater: 0.9, reach: 0.6, duration: 0.7, staminaCost: 10 },
	jump: { speed: 5, headroom: 0.3, staminaCost: 8 },
	acceleration: 12,
	airAcceleration: 2,
	gravity: 18,
	stepHeight: 0.4,
	noclipSpeed: 8,
	stamina: { max: 100, sprintDrain: 20, regen: 14, regenDelay: 0.8, recoverAt: 0.25 }
};
