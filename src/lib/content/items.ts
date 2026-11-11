import type { SoundId } from './audio/sounds.ts';

/**
 * Item definitions (data). Weapons, ammo and consumables. Behaviour is driven entirely by these
 * fields: the shared simulation (timing, ammo), the server (hits, noise) and the client (models,
 * viewmodel, sounds) all read them. See docs/dev/items.md.
 */

export type ItemKind = 'melee' | 'firearm' | 'throwable' | 'ammo' | 'consumable' | 'rite' | 'clue';

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
	/** Pocket item id the gun loads. */
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

export interface ItemDef {
	id: string;
	name: string;
	kind: ItemKind;
	/** Model in static/assets/items (world and held); null draws a placeholder. */
	model: string | null;
	/** How it looks on the floor until it has a model: a box of this size (m) and colour. */
	placeholder?: { size: [number, number, number]; color: number };
	/** Viewmodel placement: offset from the camera (m) and scale. */
	hold: { offset: [number, number, number]; scale: number };
	/** Max per hotbar slot or pocket. */
	stack: number;
	/** Hotbar items are held in the hand; pocket items (ammo, consumables) are only counted. */
	pocket: boolean;
	/** Weight of one, in kg: everything carried counts toward the load (see CARRY). */
	weight: number;
	/** Room one takes in the pack, in bulk units. Pocket items take none. */
	bulk: number;
	melee?: MeleeSpec;
	firearm?: FirearmSpec;
	throwable?: ThrowSpec;
}

const HOLD_RIGHT: ItemDef['hold'] = { offset: [0.22, -0.22, -0.42], scale: 1 };

export const ITEMS: Record<string, ItemDef> = {
	knife: {
		id: 'knife',
		name: 'Knife',
		kind: 'melee',
		model: '/assets/items/knife.glb',
		hold: HOLD_RIGHT,
		stack: 1,
		pocket: false,
		weight: 0.3,
		bulk: 1,
		melee: { damage: 18, range: 1.4, arc: 0.55, windup: 0.15, recovery: 0.3, noise: 2 }
	},
	crowbar: {
		id: 'crowbar',
		name: 'Crowbar',
		kind: 'melee',
		model: '/assets/items/crowbar.glb',
		hold: HOLD_RIGHT,
		stack: 1,
		pocket: false,
		weight: 2.5,
		bulk: 3,
		melee: { damage: 40, range: 1.8, arc: 0.6, windup: 0.45, recovery: 0.65, noise: 6 }
	},
	brick: {
		id: 'brick',
		name: 'Brick',
		kind: 'melee',
		model: '/assets/items/brick.glb',
		hold: HOLD_RIGHT,
		stack: 1,
		pocket: false,
		weight: 2.5,
		bulk: 2,
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
		model: '/assets/items/revolver.glb',
		hold: HOLD_RIGHT,
		stack: 1,
		pocket: false,
		weight: 1.1,
		bulk: 2,
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
		model: '/assets/items/shotgun.glb',
		hold: { offset: [0.2, -0.24, -0.5], scale: 1 },
		stack: 1,
		pocket: false,
		weight: 3.2,
		bulk: 4,
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
		model: '/assets/items/ammo-revolver.glb',
		hold: HOLD_RIGHT,
		stack: 60,
		pocket: true,
		weight: 0.015,
		bulk: 0
	},
	'ammo.shotgun': {
		id: 'ammo.shotgun',
		name: 'Shotgun shells',
		kind: 'ammo',
		model: '/assets/items/ammo-shotgun.glb',
		hold: HOLD_RIGHT,
		stack: 30,
		pocket: true,
		weight: 0.045,
		bulk: 0
	},
	bandage: {
		id: 'bandage',
		name: 'Bandage',
		kind: 'consumable',
		model: '/assets/items/bandage.glb',
		hold: HOLD_RIGHT,
		stack: 10,
		pocket: true,
		weight: 0.05,
		bulk: 0
	},
	// Rite items (see docs/dev/rite.md).
	pendant: {
		id: 'pendant',
		name: 'The Pendant',
		kind: 'rite',
		model: null,
		placeholder: { size: [0.1, 0.03, 0.14], color: 0xb08a3a },
		hold: HOLD_RIGHT,
		stack: 1,
		pocket: true,
		weight: 0.2,
		bulk: 0
	},
	// A clue is read where it lies and never carried: nothing can be added to an inventory.
	clue: {
		id: 'clue',
		name: 'Scrap of writing',
		kind: 'clue',
		model: null,
		placeholder: { size: [0.21, 0.01, 0.3], color: 0xcfc4a6 },
		hold: HOLD_RIGHT,
		stack: 0,
		pocket: true,
		weight: 0,
		bulk: 0
	},
	salts: {
		id: 'salts',
		name: 'Smelling salts',
		kind: 'consumable',
		model: '/assets/items/salts.glb',
		hold: HOLD_RIGHT,
		stack: 5,
		pocket: true,
		weight: 0.05,
		bulk: 0
	}
};

/** Hotbar size. */
export const HOTBAR_SLOTS = 5;

/** How far away (m) an item on the floor can be picked up, and how directly you must look at it. */
export const PICKUP = { range: 2, angle: 0.35 };
