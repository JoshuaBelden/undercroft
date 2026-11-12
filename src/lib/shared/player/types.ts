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
	/** On the floor: can only look around and drag themselves along, until revived (or bleed-out). */
	downed: boolean;
	/** Seconds spent downed. */
	downedTime: number;
	/**
	 * Seconds a downed player has held climb to surrender; at SANITY.surrenderSeconds they die.
	 * -1 until climb is let go once after going down, so a key already held doesn't count.
	 */
	surrendering: number;
	/** Bled out or surrendered: the server removes the player from the expedition. */
	dead: boolean;
	/** What the player carries (see docs/dev/items.md). */
	inventory: Inventory;
	/** The held item's action in progress (swing, shot, reload...). */
	weapon: WeaponState;
	/** Seconds spent applying the healing item in the hand (resets if interrupted). */
	bandaging: number;
	/** Seconds spent reviving a downed teammate (server-driven). */
	reviving: number;
	/** Seconds spent performing the rite (server-driven). */
	performing: number;
	/** Seconds spent holding interact to open a loot crate (server-driven). */
	opening: number;
	/** Seconds spent holding interact to erase your own chalk mark (server-driven). */
	erasing: number;
}

/** What one slot holds. */
export interface ItemStack {
	/** Key into ITEMS. */
	item: string;
	count: number;
	/** Rounds in a firearm. */
	loaded?: number;
	/** Hits taken by a breakable melee item; marks drawn with the stick in use (chalk). */
	uses?: number;
}

export type EquipmentSlot = 'primary' | 'secondary' | 'defense';

/**
 * What a player carries, and an explorer's loadout on the surface: the same thing. Every place is
 * a slot holding one stack or nothing. See docs/dev/items.md.
 */
export interface Inventory {
	/** Two weapons (only items in the weapon category) and what is worn (the defense category). */
	equipment: Record<EquipmentSlot, ItemStack | null>;
	/** Anything; as many slots as the pack has (BACKPACKS). */
	backpack: (ItemStack | null)[];
	/** Quick-use items only: what the wheel offers. SLOTS.quick of them. */
	quick: (ItemStack | null)[];
	/** What is in the hand: 0 the primary weapon, 1 the secondary, 2 and up a quick-use slot. */
	selected: number;
	/** Key into BACKPACKS. */
	pack: string;
}

export type WeaponAction = 'none' | 'equip' | 'swing' | 'shot' | 'reload' | 'throw';

/** `Inventory.selected` for the weapons; quick-use slot `i` is `HAND.quick + i`. */
export const HAND = { primary: 0, secondary: 1, quick: 2 } as const;

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
	/** Climb a ledge on land; swim up in water; surrender while downed (held). */
	climb: boolean;
	swimDown: boolean;
	/** Interact (held): extraction, reviving a teammate; doors, items and more later. */
	interact: boolean;
	/** Swing, fire or apply what is in the hand (held; firearms fire once per press). */
	attack: boolean;
	/** Aim a firearm (held); throw a throwable (press). */
	aim: boolean;
	reload: boolean;
	/** Drop the held item (press). */
	drop: boolean;
	/** What to take in the hand this frame (see `Inventory.selected`), or -1. */
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
