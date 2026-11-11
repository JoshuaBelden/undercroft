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
	/** No sanity loss (admin). */
	godMode: boolean;
	/** Firing doesn't use rounds (admin). */
	infiniteAmmo: boolean;
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
	/**
	 * Lamp failure from the Affliction, 0..1 (server-set each tick): more flicker, less light,
	 * cut-outs above 0.7. See docs/dev/affliction.md.
	 */
	gloom: number;
	flags: PlayerFlags;
	/** In water deeper than the swim threshold. */
	swimming: boolean;
	/** In shallower water: slowed, splashy footsteps. */
	wading: boolean;
	/** Eye below the water surface: breath (stamina) drains. */
	underwater: boolean;
	/** Moving slowly and silently (no footsteps; creatures hear less). */
	sneaking: boolean;
	/** Inside a squeeze volume: slowed, no sprinting, grunting through. */
	squeezing: boolean;
	mantle: Mantle | null;
	/** Seconds spent holding interact at an extraction point (resets if interrupted). */
	extracting: number;
	/** Climbed out: the server removes the player from the expedition. */
	extracted: boolean;
	/** Health: 0..SANITY.max. At 0 the player is downed. */
	sanity: number;
	/** On the floor: can only look around until revived (or until bleed-out). */
	downed: boolean;
	/** Seconds spent downed. */
	downedTime: number;
	/** Bled out: the server removes the player from the expedition. */
	dead: boolean;
	/** What the player carries (see docs/dev/items.md). */
	inventory: Inventory;
	/** The held item's action in progress (swing, shot, reload...). */
	weapon: WeaponState;
	/** Seconds spent applying a bandage (resets if interrupted). */
	bandaging: number;
	/** Seconds spent reviving a downed teammate (server-driven). */
	reviving: number;
}

/** One hotbar slot's or pack entry's contents. */
export interface ItemStack {
	/** Key into ITEMS. */
	item: string;
	count: number;
	/** Rounds in a firearm. */
	loaded?: number;
	/** Hits taken by a breakable melee item. */
	uses?: number;
}

export interface Inventory {
	/** Held items (weapons, bricks): one per slot. */
	hotbar: (ItemStack | null)[];
	/** Hotbar index in hand. */
	selected: number;
	/** Counted items: ammo, bandages, salts. Item id -> count. */
	pockets: Record<string, number>;
	/** Everything else carried, limited by the backpack's capacity (bulk). */
	pack: ItemStack[];
	/** Key into BACKPACKS. */
	backpack: string;
}

export type WeaponAction = 'none' | 'equip' | 'swing' | 'shot' | 'reload' | 'throw';

export interface WeaponState {
	action: WeaponAction;
	/** Seconds into the current action. */
	time: number;
	/** The action's moment (hit, release) has happened. */
	done: boolean;
	/** Holding aim with a firearm: slower, tighter spread. */
	aiming: boolean;
	/** Shots fired so far: seeds pellet spread, so server and client agree. */
	shots: number;
	/** Previous frame's buttons, for press edges. */
	prev: { attack: boolean; aim: boolean; reload: boolean; drop: boolean };
}

/** Something the simulation did that the server resolves (hits, noise) and clients show. */
export type SimEvent =
	| { kind: 'swing'; item: string; origin: Vec3; direction: Vec3 }
	| { kind: 'shot'; item: string; origin: Vec3; direction: Vec3; seed: number; aimed: boolean }
	| { kind: 'throw'; item: string; origin: Vec3; direction: Vec3; stack: ItemStack }
	| { kind: 'drop'; origin: Vec3; direction: Vec3; stack: ItemStack }
	| { kind: 'reloaded'; item: string }
	| { kind: 'empty'; item: string };

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
	/** Interact (held): extraction, reviving a teammate; doors, items and more later. */
	interact: boolean;
	/** Use a bandage (held). */
	heal: boolean;
	/** Swing or fire (held; firearms fire once per press). */
	attack: boolean;
	/** Aim a firearm (held); throw a throwable (press). */
	aim: boolean;
	reload: boolean;
	/** Drop the held item (press). */
	drop: boolean;
	/** Hotbar slot to switch to this frame, or -1. */
	select: number;
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
