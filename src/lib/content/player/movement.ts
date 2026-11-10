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
	acceleration: 12,
	airAcceleration: 2,
	gravity: 18,
	stepHeight: 0.4,
	noclipSpeed: 8,
	stamina: { max: 100, sprintDrain: 20, regen: 14, regenDelay: 0.8, recoverAt: 0.25 }
};
