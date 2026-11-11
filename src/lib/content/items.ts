import type { SoundId } from './audio/sounds.ts';

/**
 * Item definitions (data). Weapons, defense, ammo, consumables and loot. Behaviour is driven
 * entirely by these fields: the shared simulation (timing, ammo), the server (hits, noise) and the
 * client (models, viewmodel, sounds, slots) all read them. See docs/dev/items.md.
 */

export type ItemKind =
	'melee' | 'firearm' | 'throwable' | 'ammo' | 'consumable' | 'defense' | 'rite' | 'clue' | 'loot';

/** Which slots take an item, and the stash filter it is listed under. */
export type ItemCategory = 'weapon' | 'defense' | 'quick' | 'other';

export interface MeleeSpec {
	damage: number;
	/** Reach in metres from the eye. */
	range: number;
	/** Half-angle (radians) of the swing in front of you. */
	arc: number;
	/** Seconds from starting the swing to the hit. */
	windup: number;
	/** Seconds after the hit before you can swing again. */
	recovery: number;
	/** Radius (m) the impact can be heard. */
	noise: number;
	/** Hits before it breaks (bricks); omit for unbreakable. */
	breaksAfter?: number;
}

export interface FirearmSpec {
	/** Damage per pellet. */
	damage: number;
	pellets: number;
	/** Cone half-angle (radians) for hip fire and aimed fire. */
	spread: { hip: number; aimed: number };
	/** Effective range (m). */
	range: number;
	/** Fraction of damage lost by the end of the effective range (and beyond). */
	falloff: number;
	/** Seconds between shots. */
	interval: number;
	magazine: number;
	reloadTime: number;
	/** Item id of the rounds the gun loads (carried in the backpack). */
	ammo: string;
	/** Radius (m) the shot can be heard. */
	noise: number;
	/** Gunshot sound. */
	sound: SoundId;
}

export interface ThrowSpec {
	/** Launch speed (m/s). */
	speed: number;
	damage: number;
	/** Radius (m) the landing can be heard. */
	landNoise: number;
	/** Seconds the throw takes. */
	duration: number;
}

export interface HealSpec {
	/** Sanity given back. */
	amount: number;
	/** Seconds to apply, standing still. */
	seconds: number;
}

export interface DefenseSpec {
	/** Fraction taken off a creature's attack (0..1). */
	reduction: number;
}

export interface ItemDef {
	id: string;
	name: string;
	kind: ItemKind;
	/**
	 * Where it can be slotted: weapons in the weapon slots, defense in the defense slot, quick-use
	 * items in the quick-use slots. Anything can sit in the backpack or the stash.
	 */
	category: ItemCategory;
	/** A line or two about it, for the tooltip. */
	flavor: string;
	/** Picture in static/assets/images (no extension); without one the name is shown instead. */
	image?: string;
	/** Model in static/assets/items (world and held); null draws a placeholder. */
	model: string | null;
	/** How it looks on the floor until it has a model: a box of this size (m) and colour. */
	placeholder?: { size: [number, number, number]; color: number };
	/** Viewmodel placement: offset from the camera (m) and scale. */
	hold: { offset: [number, number, number]; scale: number };
	/** How many share a slot. 0: it can't be carried at all (clues). */
	maxStack: number;
	/** Weight of one, in kg: everything carried counts toward the load (see CARRY). */
	weight: number;
	/** What one sells for on the surface (loot). */
	value?: number;
	melee?: MeleeSpec;
	firearm?: FirearmSpec;
	throwable?: ThrowSpec;
	/** Held in the hand, attack applies it (bandages). */
	heal?: HealSpec;
	/** Brings a downed player round (smelling salts), from a quick-use slot. */
	revive?: boolean;
	/** Worn in the defense slot. */
	defense?: DefenseSpec;
}

/** How many of most things share a slot. Weapons and defense never stack. */
export const DEFAULT_STACK = 5;

const HOLD_RIGHT: ItemDef['hold'] = { offset: [0.22, -0.22, -0.42], scale: 1 };

export const ITEMS: Record<string, ItemDef> = {
	knife: {
		id: 'knife',
		name: 'Knife',
		kind: 'melee',
		category: 'weapon',
		flavor:
			'A folding knife with a worn bone handle. Quick, quiet, and only as good as your nerve.',
		model: '/assets/items/knife.glb',
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 0.3,
		melee: { damage: 18, range: 1.4, arc: 0.55, windup: 0.15, recovery: 0.3, noise: 2 }
	},
	crowbar: {
		id: 'crowbar',
		name: 'Crowbar',
		kind: 'melee',
		category: 'weapon',
		flavor: 'A yard of cold iron. Slow to swing, and nothing gets up quickly after it lands.',
		model: '/assets/items/crowbar.glb',
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 2.5,
		melee: { damage: 40, range: 1.8, arc: 0.6, windup: 0.45, recovery: 0.65, noise: 6 }
	},
	// Wears with every blow, so each one keeps its own slot.
	brick: {
		id: 'brick',
		name: 'Brick',
		kind: 'melee',
		category: 'quick',
		flavor:
			'A loose brick from the walls. Good for a few blows, or for making a noise somewhere you are not.',
		model: '/assets/items/brick.glb',
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 2.5,
		melee: {
			damage: 25,
			range: 1.5,
			arc: 0.5,
			windup: 0.3,
			recovery: 0.5,
			noise: 5,
			breaksAfter: 3
		},
		throwable: { speed: 14, damage: 30, landNoise: 8, duration: 0.6 }
	},
	revolver: {
		id: 'revolver',
		name: 'Revolver',
		kind: 'firearm',
		category: 'weapon',
		flavor:
			'Six chambers, and a report that carries a long way down here. Everything will know where you are.',
		model: '/assets/items/revolver.glb',
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 1.1,
		firearm: {
			damage: 32,
			pellets: 1,
			spread: { hip: 0.035, aimed: 0.006 },
			range: 40,
			falloff: 0.25,
			interval: 0.5,
			magazine: 6,
			reloadTime: 2.5,
			ammo: 'ammo.revolver',
			noise: 35,
			sound: 'revolver.fire'
		}
	},
	shotgun: {
		id: 'shotgun',
		name: 'Shotgun',
		kind: 'firearm',
		category: 'weapon',
		flavor: 'Two barrels, cut short. Unanswerable up close; a rumour at any distance.',
		model: '/assets/items/shotgun.glb',
		hold: { offset: [0.2, -0.24, -0.5], scale: 1 },
		maxStack: 1,
		weight: 3.2,
		firearm: {
			damage: 9,
			pellets: 8,
			spread: { hip: 0.1, aimed: 0.065 },
			range: 18,
			falloff: 0.6,
			interval: 1.0,
			magazine: 2,
			reloadTime: 3,
			ammo: 'ammo.shotgun',
			noise: 40,
			sound: 'shotgun.fire'
		}
	},
	'ammo.revolver': {
		id: 'ammo.revolver',
		name: 'Revolver rounds',
		kind: 'ammo',
		category: 'other',
		flavor: 'Loose rounds for the revolver.',
		model: '/assets/items/ammo-revolver.glb',
		hold: HOLD_RIGHT,
		maxStack: 30,
		weight: 0.015
	},
	'ammo.shotgun': {
		id: 'ammo.shotgun',
		name: 'Shotgun shells',
		kind: 'ammo',
		category: 'other',
		flavor: 'Paper-cased shells for the shotgun. Keep them dry.',
		model: '/assets/items/ammo-shotgun.glb',
		hold: HOLD_RIGHT,
		maxStack: 20,
		weight: 0.045
	},
	bandage: {
		id: 'bandage',
		name: 'Bandage',
		kind: 'consumable',
		category: 'quick',
		flavor: 'Clean linen. Binding something, even a small thing, steadies the mind.',
		model: '/assets/items/bandage.glb',
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.05,
		heal: { amount: 25, seconds: 3 }
	},
	salts: {
		id: 'salts',
		name: 'Smelling salts',
		kind: 'consumable',
		category: 'quick',
		flavor: 'A stoppered vial that would wake the dead. Near enough, anyway.',
		model: '/assets/items/salts.glb',
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.05,
		revive: true
	},
	// Defense: a stand-in until there is real protection to find (see docs/dev/items.md).
	coat: {
		id: 'coat',
		name: 'Padded coat',
		kind: 'defense',
		category: 'defense',
		flavor: 'Quilted wool, stiff with old wax. It will not stop them. It makes them work for it.',
		model: null,
		placeholder: { size: [0.4, 0.12, 0.5], color: 0x4a4238 },
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 2,
		defense: { reduction: 0.25 }
	},
	// Loot: a stand-in until there are real things to find (see docs/dev/economy.md).
	relic: {
		id: 'relic',
		name: 'Relic',
		kind: 'loot',
		category: 'other',
		flavor: 'Something old that someone above will pay for. They never ask where it lay.',
		model: null,
		placeholder: { size: [0.2, 0.2, 0.2], color: 0x8a7a5a },
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 1.5,
		value: 25
	},
	// Rite items (see docs/dev/rite.md).
	pendant: {
		id: 'pendant',
		name: 'The Pendant',
		kind: 'rite',
		category: 'other',
		flavor: 'Heavier than it should be, and never quite warm.',
		model: null,
		placeholder: { size: [0.1, 0.03, 0.14], color: 0xb08a3a },
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 0.2
	},
	// A clue is read where it lies and never carried: nothing can be added to an inventory.
	clue: {
		id: 'clue',
		name: 'Scrap of writing',
		kind: 'clue',
		category: 'other',
		flavor: 'A torn scrap in a cramped hand.',
		model: null,
		placeholder: { size: [0.21, 0.01, 0.3], color: 0xcfc4a6 },
		hold: HOLD_RIGHT,
		maxStack: 0,
		weight: 0
	}
};

/** How many slots there are, where it isn't the backpack's to say (see BACKPACKS). */
export const SLOTS = {
	/** Stash slots a new explorer has. */
	stash: 30,
	/** Stash slots across. */
	stashColumns: 5,
	/** Quick-use slots: what the wheel offers underground. */
	quick: 6
};

/** How far away (m) an item on the floor can be picked up, and how directly you must look at it. */
export const PICKUP = { range: 2, angle: 0.35 };
