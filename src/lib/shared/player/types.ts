import type { Vec3 } from '../map/types.ts';

/**
 * Player simulation types, shared by server (authoritative) and client (prediction).
 * Coordinates are Three.js world space; `position` is the bottom of the player capsule.
 */

export type Stance = 'stand' | 'crouch' | 'crawl';

/** 0 = off, 1 = low, 2 = bright. */
export type HeadlampMode = 0 | 1 | 2;

export interface PlayerFlags {
	noclip: boolean;
	infiniteStamina: boolean;
	infiniteBattery: boolean;
}

/** An in-progress climb onto a ledge. Position follows a fixed path; input is ignored. */
export interface Mantle {
	from: Vec3;
	to: Vec3;
	/** Seconds elapsed. */
	t: number;
	duration: number;
	/** Stance to end in (whatever fits on the ledge). */
	stance: Stance;
}

export interface PlayerState {
	position: Vec3;
	velocity: Vec3;
	/** Radians around +Y; 0 looks toward -Z (north). */
	yaw: number;
	/** Radians; positive looks up. */
	pitch: number;
	stance: Stance;
	grounded: boolean;
	/** 0..tuning.stamina.max */
	stamina: number;
	/** Set when stamina hits zero; sprinting is blocked until it recovers. */
	exhausted: boolean;
	/** Seconds until stamina starts regenerating. */
	staminaDelay: number;
	headlamp: HeadlampMode;
	/** 0..1 charge left. */
	battery: number;
	/** Seconds the lamp has been lit; drives the deterministic flicker. */
	lampClock: number;
	flags: PlayerFlags;
	/** In water deeper than the swim threshold. */
	swimming: boolean;
	/** In shallower water: slowed, splashy footsteps. */
	wading: boolean;
	/** Eye below the water surface: breath (stamina) drains. */
	underwater: boolean;
	/** Moving slowly and silently (no footsteps; Thralls will hear less in Phase 2). */
	sneaking: boolean;
	/** Inside a squeeze volume: slowed, no sprinting, grunting through. */
	squeezing: boolean;
	mantle: Mantle | null;
	/** Seconds spent holding interact at an extraction point (resets if interrupted). */
	extracting: number;
	/** Climbed out: the server removes the player from the expedition. */
	extracted: boolean;
}

/** One fixed simulation step of player input (1 / SIM_RATE seconds). */
export interface InputFrame {
	seq: number;
	/** Strafe, -1 (left) .. 1 (right). */
	moveX: number;
	/** Forward, -1 (back) .. 1 (forward). */
	moveZ: number;
	yaw: number;
	pitch: number;
	sprint: boolean;
	/** Slow, silent walk (held). */
	sneak: boolean;
	/** Climb a ledge on land; swim up in water (held). */
	climb: boolean;
	swimDown: boolean;
	/** Interact (held): extraction now; doors, items and more later. */
	interact: boolean;
	stance: Stance;
	headlamp: HeadlampMode;
}

/** A player's authoritative state as broadcast in each server tick. */
export interface PlayerSnapshot {
	id: string;
	name: string;
	state: PlayerState;
	/** Last input frame `seq` the server has applied for this player. */
	ack: number;
}
