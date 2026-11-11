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
	acceleration: 12,
	airAcceleration: 2,
	gravity: 18,
	stepHeight: 0.4,
	noclipSpeed: 8,
	stamina: { max: 100, sprintDrain: 20, regen: 14, regenDelay: 0.8, recoverAt: 0.25 }
};
