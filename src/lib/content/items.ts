import type { SoundId } from './audio/sounds.ts';
import { modelUrl } from './models.ts';

/**
 * Item definitions (data). Weapons, defense, ammo, consumables and loot. Behaviour is driven
 * entirely by these fields: the shared simulation (timing, ammo), the server (hits, noise) and the
 * client (models, viewmodel, sounds, slots) all read them. See docs/dev/items.md.
 */

export type ItemKind =
	'melee' | 'firearm' | 'throwable' | 'ammo' | 'consumable' | 'defense' | 'rite' | 'clue' | 'loot';

/** How hard an item is to come by, commonest first. Shown on its slot and in its tooltip. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Every rarity, commonest first, with the name shown for it. */
export const RARITIES: { id: Rarity; name: string }[] = [
	{ id: 'common', name: 'Common' },
	{ id: 'uncommon', name: 'Uncommon' },
	{ id: 'rare', name: 'Rare' },
	{ id: 'epic', name: 'Epic' },
	{ id: 'legendary', name: 'Legendary' }
];

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
	/** Played when a reload starts; it should last about `reloadTime`. */
	reloadSound: SoundId;
	/** Aiming down the sights narrows the view to this fraction of the field of view (and slows the mouse to match). */
	zoom: number;
	recoil: RecoilSpec;
}

/** What firing does to your aim and to the gun in your hands. */
export interface RecoilSpec {
	/**
	 * Your view is thrown up by `pitch` radians, and sideways by up to `yaw` either way, over a
	 * moment: you have to bring it back on target yourself.
	 */
	pitch: number;
	yaw: number;
	/** The gun in your hands turns up `rise` radians and comes back `back` metres... */
	rise: number;
	back: number;
	/** ...and settles over this many seconds. */
	settle: number;
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

export interface ChargeSpec {
	/** Volts it puts back into the headlamp (never past the lamp's full `volts`). */
	volts: number;
	/** Seconds to swap it in, standing still. */
	seconds: number;
}

export interface ChalkSpec {
	/** Marks one stick makes before it is used up. */
	marks: number;
}

export interface DefenseSpec {
	/**
	 * Points of a creature's blow it takes before the wearer does. The points it has taken are kept
	 * on the stack (`ItemStack.worn`); when they are all used up it is torn apart and gone.
	 */
	shield: number;
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
	/** Picture in static/assets/ui/images (no extension); without one the name is shown instead. */
	image?: string;
	/** Model (`modelUrl`, built into static/assets/shared/items), world and held; null draws a placeholder. */
	model: string | null;
	/** How it looks on the floor until it has a model: a box of this size (m) and colour. */
	placeholder?: { size: [number, number, number]; color: number };
	/**
	 * Viewmodel placement: offset from the camera (m) and scale. `aim` is where it moves when
	 * aiming down the sights (firearms): low and a little right, so it never covers the
	 * crosshair. `muzzle` is the barrel's end in the model's own space, for the flash and smoke.
	 */
	hold: {
		offset: [number, number, number];
		scale: number;
		aim?: [number, number, number];
		muzzle?: [number, number, number];
	};
	/** How many share a slot. 0: it can't be carried at all (clues). */
	maxStack: number;
	/** Weight of one, in kg: everything carried counts toward the load (see CARRY). */
	weight: number;
	/** What one sells for on the surface (loot). */
	value?: number;
	/**
	 * Treasure: good for nothing but its value. Listed under its own stash filter and marked with
	 * a diamond on its slot.
	 */
	treasure?: boolean;
	/** How hard it is to come by; common when left out. */
	rarity?: Rarity;
	/**
	 * A quest item: one of a kind, and needed for a rite. Listed under its own stash filter, with a
	 * purple edge and a star on its slot in place of a rarity.
	 */
	quest?: boolean;
	melee?: MeleeSpec;
	firearm?: FirearmSpec;
	throwable?: ThrowSpec;
	/** Held in the hand, attack applies it (bandages). */
	heal?: HealSpec;
	/** Held in the hand, attack puts it in the headlamp (batteries). */
	charge?: ChargeSpec;
	/** Brings a downed player round (smelling salts), from a quick-use slot. */
	revive?: boolean;
	/** Draws marks on walls from the quick-use slot (see docs/dev/marks.md). */
	chalk?: ChalkSpec;
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
		image: 'knife',
		model: modelUrl('shared/items/knife.glb'),
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
		image: 'crowbar',
		model: modelUrl('shared/items/crowbar.glb'),
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
		image: 'brick',
		model: modelUrl('shared/items/brick.glb'),
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
		image: 'revolver',
		model: modelUrl('shared/items/revolver.glb'),
		hold: { ...HOLD_RIGHT, aim: [0.06, -0.15, -0.34], muzzle: [0, 0.045, -0.21] },
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
			sound: 'revolver.fire',
			reloadSound: 'revolver.reload',
			zoom: 0.6,
			recoil: { pitch: 0.035, yaw: 0.012, rise: 0.45, back: 0.08, settle: 0.16 }
		}
	},
	shotgun: {
		id: 'shotgun',
		name: 'Shotgun',
		kind: 'firearm',
		category: 'weapon',
		flavor: 'Two barrels, cut short. Unanswerable up close; a rumour at any distance.',
		image: 'shotgun',
		model: modelUrl('shared/items/shotgun.glb'),
		hold: {
			offset: [0.2, -0.24, -0.5],
			scale: 1,
			aim: [0.07, -0.21, -0.42],
			muzzle: [0, 0.05, -0.7]
		},
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
			sound: 'shotgun.fire',
			reloadSound: 'shotgun.reload',
			zoom: 0.7,
			// A real shove: about 9 degrees up, and the gun slams back into your shoulder.
			recoil: { pitch: 0.15, yaw: 0.05, rise: 0.9, back: 0.28, settle: 0.45 }
		}
	},
	'ammo.revolver': {
		id: 'ammo.revolver',
		name: 'Revolver rounds',
		kind: 'ammo',
		category: 'other',
		flavor: 'Loose rounds for the revolver.',
		image: 'revolver_shells',
		model: modelUrl('shared/items/ammo-revolver.glb'),
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
		image: 'shotgun_shells',
		model: modelUrl('shared/items/ammo-shotgun.glb'),
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
		image: 'bandages',
		model: modelUrl('shared/items/bandage.glb'),
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.05,
		heal: { amount: 25, seconds: 3 }
	},
	// Half a lamp's worth: the starter lamp is full at 24 V (see items/headlamps.ts).
	battery: {
		id: 'battery',
		name: 'Battery',
		kind: 'consumable',
		category: 'quick',
		flavor: 'A dry cell, half spent by whoever carried it last. Enough to buy a little more light.',
		image: 'battery',
		model: modelUrl('shared/items/battery.glb'),
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.15,
		value: 20,
		rarity: 'uncommon',
		charge: { volts: 12, seconds: 2 }
	},
	salts: {
		id: 'salts',
		name: 'Smelling salts',
		kind: 'consumable',
		category: 'quick',
		flavor: 'A stoppered vial that would wake the dead. Near enough, anyway.',
		image: 'smelling_salts',
		model: modelUrl('shared/items/salts.glb'),
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.05,
		revive: true
	},
	// One mark a stick (see docs/dev/marks.md), and the rite takes one.
	chalk: {
		id: 'chalk',
		name: 'Chalk',
		kind: 'consumable',
		category: 'quick',
		flavor: 'A stub of soft chalk. A mark on the wall is the only thread back out.',
		image: 'chalk',
		model: modelUrl('shared/items/chalk.glb'),
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.01,
		chalk: { marks: 1 }
	},
	// Unlit. The rite takes five; lighting them comes with light sources.
	candle: {
		id: 'candle',
		name: 'Candle',
		kind: 'consumable',
		category: 'other',
		flavor: 'Yellow tallow, already burned once. It smells of the animal it came from.',
		image: 'candle',
		model: null,
		placeholder: { size: [0.03, 0.15, 0.03], color: 0xd8cba0 },
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.08
	},
	// Defense: a stand-in until there is real protection to find (see docs/dev/items.md).
	coat: {
		id: 'coat',
		name: 'Padded coat',
		kind: 'defense',
		category: 'defense',
		flavor: 'Quilted wool, stiff with old wax. It will not stop them. It makes them work for it.',
		image: 'padded_coat',
		model: null,
		placeholder: { size: [0.4, 0.12, 0.5], color: 0x4a4238 },
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 2,
		defense: { shield: 40 }
	},
	// Loot: what is carried out and sold (see docs/dev/economy.md). None has a model yet.
	coins: {
		id: 'coins',
		name: 'Old coins',
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor: 'Worn smooth. Laid on eyes once, or pressed into a palm for the crossing.',
		image: 'coins',
		model: null,
		placeholder: { size: [0.08, 0.02, 0.08], color: 0x7a6a4a },
		hold: HOLD_RIGHT,
		maxStack: 20,
		weight: 0.02,
		value: 3
	},
	rosary: {
		id: 'rosary',
		name: 'Bone rosary',
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor: 'Beads turned from knuckles. Someone counted on these for a long time.',
		image: 'bone_rosary',
		model: null,
		placeholder: { size: [0.12, 0.02, 0.12], color: 0xb8ad94 },
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.1,
		value: 12
	},
	tooth: {
		id: 'tooth',
		name: 'Gold tooth',
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor: 'It came out easier than it should have.',
		image: 'gold_tooth',
		model: null,
		placeholder: { size: [0.03, 0.03, 0.03], color: 0xc9a23a },
		hold: HOLD_RIGHT,
		maxStack: 10,
		weight: 0.01,
		value: 30,
		rarity: 'uncommon'
	},
	signet: {
		id: 'signet',
		name: 'Signet ring',
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor: 'A crest nobody above remembers. The gold is still gold.',
		image: 'signet_ring',
		model: null,
		placeholder: { size: [0.04, 0.02, 0.04], color: 0xb8902e },
		hold: HOLD_RIGHT,
		maxStack: DEFAULT_STACK,
		weight: 0.02,
		value: 45,
		rarity: 'uncommon'
	},
	candlestick: {
		id: 'candlestick',
		name: 'Silver candlestick',
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor: 'Black with tarnish and heavy in the hand. It will clean up.',
		image: 'silver_candlestick',
		model: null,
		placeholder: { size: [0.1, 0.3, 0.1], color: 0x8c9094 },
		hold: HOLD_RIGHT,
		maxStack: 2,
		weight: 1.2,
		value: 110,
		rarity: 'rare'
	},
	chalice: {
		id: 'chalice',
		name: 'Chalice',
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor: 'Gilt inside, garnets round the stem. Whatever it held has dried to a stain.',
		image: 'chalice',
		model: null,
		placeholder: { size: [0.12, 0.2, 0.12], color: 0xc2a64e },
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 1.8,
		value: 260,
		rarity: 'epic'
	},
	relic: {
		id: 'relic',
		name: 'Reliquary',
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor:
			'A casket of gold and rock crystal with something small and brown inside. They never ask where it lay.',
		image: 'reliquary',
		model: null,
		placeholder: { size: [0.2, 0.2, 0.2], color: 0xd9b84a },
		hold: HOLD_RIGHT,
		maxStack: 1,
		weight: 3,
		value: 600,
		rarity: 'legendary'
	},
	// Rite items (see docs/dev/rite.md).
	pendant: {
		id: 'pendant',
		name: 'The Pendant',
		kind: 'rite',
		category: 'other',
		flavor: 'Heavier than it should be, and never quite warm.',
		image: 'pendant',
		quest: true,
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
		image: 'note',
		model: null,
		placeholder: { size: [0.21, 0.01, 0.3], color: 0xcfc4a6 },
		hold: HOLD_RIGHT,
		maxStack: 0,
		weight: 0
	}
};

/** How hard an item is to come by. */
export function rarityOf(item: string): Rarity {
	return ITEMS[item]?.rarity ?? 'common';
}

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
