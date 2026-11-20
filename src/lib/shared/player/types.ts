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

/** Holding on to a rope (see docs/dev/rope.md). The feet are `position`, beside the rope. */
export interface Climb {
	/** `RopeLine.id` in the collision world. */
	rope: string;
	/** Unit [x, z] from the rope to the climber: which side of it they hang on. */
	side: [number, number];
}

/** A condition on the player (key into CONDITIONS) and the seconds it has left. */
export interface ActiveCondition {
	id: string;
	remaining: number;
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
	/**
	 * Dived under: no floating back up. You stay at the depth you are until you swim up to the
	 * surface (or run out of breath, which forces you up).
	 */
	submerged: boolean;
	/** Moving slowly and silently (no footsteps; creatures hear less). */
	sneaking: boolean;
	/** Inside a squeeze volume: slowed, no sprinting, grunting through. */
	squeezing: boolean;
	mantle: Mantle | null;
	/** On a rope, or null. */
	climbing: Climb | null;
	/** Interact was held last step: grabbing a rope takes a fresh press. */
	interactKey: boolean;
	/** Climb was held last step: a jump takes a fresh press. */
	climbKey: boolean;
	/** Hobbled and the like (CONDITIONS), each with the seconds it has left. */
	conditions: ActiveCondition[];
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
	/** Seconds spent putting the battery in the hand into the headlamp (resets if interrupted). */
	charging: number;
	/**
	 * Seconds spent using the item in the hand on a teammate (bandaging them, changing their
	 * battery); resets if interrupted. See src/lib/shared/player/tend.ts.
	 */
	tending: number;
	/** The teammate being tended (their player id), or null. */
	patient: string | null;
	/** Seconds spent reviving a downed teammate (server-driven). */
	reviving: number;
	/** Seconds spent performing the rite (server-driven). */
	performing: number;
	/** Seconds spent holding interact to open a loot crate (server-driven). */
	opening: number;
	/**
	 * Seconds spent prying at a dead end's wall with a crowbar (server-driven); -1 once it is done,
	 * until interact is let go.
	 */
	prying: number;
	/** Seconds spent holding interact to erase your own chalk mark (server-driven). */
	erasing: number;
	/** Seconds spent holding interact to tie, untie or gather up a rope (server-driven). */
	roping: number;
	/** Seconds spent holding interact to open a door between levels (server-driven). */
	unbarring: number;
	/**
	 * Seconds spent sketching into the map (server-driven). -1 once a sketch is done, until the
	 * hold is let go, so a held button sketches once. See docs/dev/map.md.
	 */
	sketching: number;
	/** Seconds spent showing your map to a teammate (server-driven); -1 after, like `sketching`. */
	sharing: number;
	/** Seconds spent holding interact on the surveyor, taking his map (server-driven). */
	consulting: number;
}

/** What one slot holds. */
export interface ItemStack {
	/** Key into ITEMS. */
	item: string;
	count: number;
	/** Rounds in a firearm. */
	loaded?: number;
	/** Hits taken by a breakable melee item (a brick: gone at the last); marks drawn with chalk. */
	uses?: number;
	/**
	 * Wear an item with `durability` has taken (hits, shots, shield points...): broken when it
	 * reaches the most it takes. See src/lib/shared/items/durability.ts.
	 */
	worn?: number;
}

/** The gear slot holds three things: one equipment slot each. */
export const GEAR_SLOTS = ['gear1', 'gear2', 'gear3'] as const;

export type GearSlot = (typeof GEAR_SLOTS)[number];

export type EquipmentSlot = 'primary' | 'secondary' | 'defense' | GearSlot;

/**
 * What a player carries, and an explorer's loadout on the surface: the same thing. Every place is
 * a slot holding one stack or nothing. See docs/dev/items.md.
 */
export interface Inventory {
	/**
	 * Two weapons (only items in the weapon category), what is worn for defense (the defense
	 * category) and the three gear slots (the gear category). A loadout saved before the gear slots
	 * existed has no gear keys: read a slot with `getSlot`, which takes a missing one as empty.
	 */
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

/**
 * `draw`: attack held with a throwable in the hand, drawing it back to throw (see `stepWeapon`).
 * `throw`: it has left the hand, and the arm comes through.
 */
export type WeaponAction =
	| 'none'
	| 'equip'
	| 'swing'
	| 'shot'
	| 'reload'
	| 'draw'
	| 'throw'
	/** Holding attack with something to set down (a snare, salt): `ItemDef.place`. */
	| 'place';

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
	prev: { attack: boolean; reload: boolean };
	/** Seconds the weapon in the hand is still snagged (`melee.snag`): it won't swing. */
	snag: number;
	/** A throw was put down (aim, the menu): nothing more until attack is let go. */
	putDown: boolean;
}

/** Something the simulation did that the server resolves (hits, noise) and clients show. */
export type SimEvent =
	| { kind: 'swing'; item: string; origin: Vec3; direction: Vec3 }
	| { kind: 'shot'; item: string; origin: Vec3; direction: Vec3; seed: number; aimed: boolean }
	| { kind: 'throw'; item: string; origin: Vec3; direction: Vec3; stack: ItemStack }
	| { kind: 'reloaded'; item: string }
	/** Hit the floor faster than FALL.safeSpeed (m/s): the server takes sanity for it. */
	| { kind: 'land'; speed: number }
	| { kind: 'grab'; rope: string }
	/** Let go of a rope or slipped off it (out of stamina). Not stepping off at either end. */
	| { kind: 'letgo'; rope: string }
	| { kind: 'empty'; item: string }
	/** Too little stamina to swing (`melee.stamina`): a gasp, and no swing. */
	| { kind: 'winded'; item: string }
	/** Something was set down on the floor in front (`ItemDef.place`): one of it is spent. */
	| { kind: 'place'; item: string; origin: Vec3; direction: Vec3 }
	/** What was in the hand just broke (a gun's last shot): it stays there, and does nothing. */
	| { kind: 'broke'; item: string }
	/** Used the item in the hand on a teammate (one of it is spent): the server applies it to them. */
	| { kind: 'tend'; patient: string; item: string };

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
	/** Jump (a fresh press) or climb a ledge (held) on land; swim up in water; surrender while downed (held). */
	climb: boolean;
	swimDown: boolean;
	/** Let go of the rope you are on (stance, pressed while climbing). */
	letGo: boolean;
	/** Interact (held): extraction, reviving a teammate, taking hold of a rope (pressed). */
	interact: boolean;
	/**
	 * Swing, fire or apply what is in the hand (held; firearms fire once per press). Held with a
	 * throwable, it draws it back: let go to swing, or to throw once it is drawn.
	 */
	attack: boolean;
	/** Aim a firearm (held); use the item in the hand on a teammate (held). */
	aim: boolean;
	reload: boolean;
	/** What to take in the hand this frame (see `Inventory.selected`), or -1. */
	select: number;
	stance: Stance;
	headlamp: HeadlampMode;
	/** Held on the map screen: sketching what is around you, or showing your map to a teammate. */
	survey: SurveyHold;
	/** The in-game menu is open: both hands are on it (see `handsBusy`). */
	reading: boolean;
}

/** What the map screen's hold is doing (docs/dev/map.md). */
export type SurveyHold = 'sketch' | 'share' | null;

/** A player's authoritative state as broadcast in each server tick. */
export interface PlayerSnapshot {
	id: string;
	name: string;
	state: PlayerState;
	/** Last input frame `seq` the server has applied for this player. */
	ack: number;
}
