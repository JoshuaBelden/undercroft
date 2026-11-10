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
