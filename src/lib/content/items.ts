import type { SoundId } from './audio/sounds.ts';
import { GEAR } from './items/gear.ts';
import { MATERIALS } from './items/materials.ts';
import { QUICK } from './items/quick.ts';
import { TREASURE } from './items/treasure.ts';
import { WEAPONS } from './items/weapons.ts';
import { modelUrl } from './models.ts';
import type { ConditionId } from './player/conditions.ts';
import { SANITY } from './player/sanity.ts';

/**
 * Item definitions (data). Weapons, defense, ammo, consumables and loot. Behaviour is driven
 * entirely by these fields: the shared simulation (timing, ammo), the server (hits, noise) and the
 * client (models, sounds, slots) all read them. See docs/dev/items.md.
 */

export type ItemKind =
	| 'melee'
	| 'firearm'
	| 'throwable'
	| 'ammo'
	| 'consumable'
	| 'defense'
	| 'gear'
	| 'material'
	| 'rite'
	| 'clue'
	| 'loot';

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

/**
 * Which slots take an item, and the stash filter it is listed under. Gear goes in the gear slots
 * (worn, not used: it works while it is there); materials only ever sit in the backpack or the
 * stash, never in a quick-use slot.
 */
export type ItemCategory = 'weapon' | 'defense' | 'quick' | 'gear' | 'material' | 'other';

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
	/**
	 * Stamina each swing costs. With too little left it won't swing at all (and the explorer gasps):
	 * heavy weapons empty it in a few blows.
	 */
	stamina?: number;
	/** It hits every creature in its arc, each for `damage`, not just the nearest (a trench spade). */
	sweep?: boolean;
	/** A hit sets the creature bleeding: `dps` damage a second for `seconds` (a nail-studded club). */
	bleed?: { dps: number; seconds: number };
	/** A hit can snag: with this chance, it is stuck for `seconds` and won't swing (the club). */
	snag?: { chance: number; seconds: number };
	/** A hit staggers it this long (s), however hard it took it (a sledgehammer). */
	stagger?: number;
	/** Its own swing and hit, in place of `melee.swing` and `melee.hit`; null plays nothing. */
	sound?: { swing: SoundId | null; hit: SoundId | null };
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
	recoil: RecoilSpec;
	/** Each pellet passes through every creature in its line, to the first wall (a rifle). */
	pierce?: boolean;
	/**
	 * It doesn't hit at once: each shot is a round in flight, at `speed` m/s, falling as it goes (a
	 * crossbow's bolt, a slingshot's pebble). It lands where it stops, heard `landNoise` away, and
	 * can be picked up again, unless it breaks on a hit (`breakChance`).
	 */
	projectile?: { speed: number; landNoise: number; breakChance?: number };
	/** It loads one round at a time, each reload a round (a bolt-action rifle). */
	single?: boolean;
	/** Reloading it, no faster than a crawl (cranking a crossbow). */
	reloadSlow?: boolean;
	/** Other rounds it fires when it has none of its `ammo` (old coins in a slingshot). */
	alsoFires?: string[];
}

/** What firing does to your aim. */
export interface RecoilSpec {
	/**
	 * Your view is thrown up by `pitch` radians, and sideways by up to `yaw` either way, over a
	 * moment: you have to bring it back on target yourself.
	 */
	pitch: number;
	yaw: number;
}

/** Thrown by holding attack until it is drawn back (`THROW_DRAW`), then letting go (`stepWeapon`). */
export interface ThrowSpec {
	/** Launch speed (m/s). */
	speed: number;
	damage: number;
	/** Radius (m) the landing can be heard. */
	landNoise: number;
	/** Sound as it leaves the hand. */
	sound: SoundId;
	/** Sound where it lands. */
	land: SoundId;
	/**
	 * A lure on a fuse (firecrackers): `seconds` after it lands it goes off, heard `noise` away,
	 * hissing (`hiss`) till then and banging (`bang`) when it does. Used up when it does.
	 */
	fuse?: { seconds: number; noise: number; hiss: SoundId; bang: SoundId };
	/**
	 * It bursts into a fire where it lands (an oil bottle): `radius` m across it, `dps` damage a
	 * second to every creature (and explorer) in it, for `seconds`; it lights its patch while it
	 * burns. Used up when it lands. `sound`: the burst; the burning is `fire.burn`.
	 */
	fire?: { radius: number; dps: number; seconds: number; sound: SoundId };
	/**
	 * A light where it lands (a glow stick): `range` m, for `seconds`, fading at the end. It counts
	 * toward the light budget, and moths come to it.
	 */
	glow?: { seconds: number; range: number; color: number };
	/** Creatures of a kind within `radius` go to it and stay, for `seconds` (bait: rats). */
	lure?: { creature: string; radius: number; seconds: number };
}

/**
 * Set down on the floor in front, holding attack for `seconds` (a snare, a line of salt). It stays
 * there: see docs/dev/combat.md#placed-things.
 */
export interface PlaceSpec {
	/** Seconds attack is held to set it down, standing still. */
	seconds: number;
	/** Played as it is set down. */
	sound: SoundId;
	/** A snare: holds the first creature that steps within `radius` m for `hold` seconds, once. */
	snare?: { hold: number; radius: number };
	/** A line creatures won't cross, `length` m long across the way, for `seconds` (blessed salt). */
	ward?: { length: number; seconds: number };
	/**
	 * A rope anchor, hammered in at the edge of a drop the player faces (a climbing piton): a rope
	 * can be tied there from then on. Nowhere to hammer it, it isn't used up. See PITONS.
	 */
	anchor?: boolean;
	/**
	 * A line across the way (a tripwire bell): when a creature crosses it, it rings, heard `noise`
	 * away, and the party is told. It sets itself again, a use of its wear each time.
	 */
	tripwire?: { length: number; noise: number };
	/**
	 * A charge (the quarryman's): `fuse` seconds after it is set it goes off, heard `noise` away,
	 * and blows open a barred door within `radius` m (docs/dev/quests.md#the-barred-stair).
	 */
	blast?: { fuse: number; radius: number; noise: number };
}

export interface HealSpec {
	/** Sanity given back. */
	amount: number;
	/** Seconds to apply, standing still. */
	seconds: number;
	/**
	 * Set down on the floor to use (a medkit): using it on yourself crouches you, and your body
	 * kneels over it with the kit on the floor (see docs/dev/player.md#holding-and-using-items).
	 */
	kneel?: boolean;
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

/** Rope (see docs/dev/rope.md): laid along the floor, or tied at an anchor to climb down. */
export interface RopeSpec {
	/**
	 * Metres of rope in it: the longest it lays, and whether it reaches the bottom of a drop.
	 * Laying or tying it uses the whole thing, however much of it that took.
	 */
	length: number;
}

export interface DefenseSpec {
	/**
	 * Points of a creature's blow it takes before the wearer does. The points it has taken are its
	 * wear (`ItemStack.worn`, in `point`s: its `durability.max` is this shield). When they are all
	 * used up it is broken: it stays in the slot and takes nothing until it is repaired.
	 */
	shield: number;
}

/**
 * What one unit of an item's wear is: a hit it lands (melee), a shot it fires, a point of a blow
 * it takes (defense), a use (crafts, searches, resets) or a second of being worn (gear).
 */
export type WearUnit = 'hit' | 'shot' | 'point' | 'use' | 'second';

/**
 * How much wear an item takes before it is broken. The wear taken is on the stack
 * (`ItemStack.worn`), so it lasts through extraction and the stash. A broken item keeps its slot
 * and its looks, and can still be equipped, but does nothing until it is repaired (see
 * src/lib/shared/items/durability.ts and docs/dev/items.md#durability).
 */
export interface DurabilitySpec {
	/** Wear, in `per`, from new to broken. */
	max: number;
	per: WearUnit;
}

/**
 * How the arms hold an item: a gun or blade in one hand, a long gun in both, or something small
 * carried in front. Picks the explorer's holding clip (see docs/dev/player.md#player-model).
 */
export type HoldPose = 'oneHand' | 'twoHand' | 'item';

/**
 * Where an item's model sits in the explorer's right hand, in the hand bone's own frame: an
 * offset (m) and a rotation (XYZ Euler, radians). Worked out in Blender with
 * scripts/blender/explorer.py (`grip_numbers`), then tuned with the admin Grip check.
 */
export interface GripSpec {
	pose: HoldPose;
	offset: [number, number, number];
	rotation: [number, number, number];
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
	 * A gun's barrel end in its model's own space, for the flash and smoke of a shot from the gun
	 * in an explorer's hands (`PlayerBody.muzzle`). Without one, a shot flashes in front of the eyes.
	 */
	muzzle?: [number, number, number];
	/**
	 * How it is held on an explorer's body (other players, and you over the shoulder): the pose
	 * of the arms, and where the model sits in the right hand. Items that can't be in the hand
	 * leave it out, and aren't drawn there.
	 */
	grip?: GripSpec;
	/** How many share a slot. 0: it can't be carried at all (clues). */
	maxStack: number;
	/** Weight of one, in kg: everything carried counts toward the load (see CARRY). */
	weight: number;
	/**
	 * What one is worth new, in coin: the store sells it at this (`SHOP`), and selling it back and
	 * repairs are worked out from it. Things the store doesn't sell have one too. Left out for what
	 * has no price: treasure (it has a `value`), quest items and clues.
	 */
	price?: number;
	/** What one sells for on the surface (loot): sold at this, not at a share of `price`. */
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
	/** Rope to lay or tie, from the quick-use slot (see docs/dev/rope.md). */
	rope?: RopeSpec;
	/** Worn in the defense slot. */
	defense?: DefenseSpec;
	/** It wears out with use and breaks (see DurabilitySpec). Without one it never wears. */
	durability?: DurabilitySpec;
	/**
	 * Carried anywhere, it lets you open your map, sketch into it and show it to a teammate
	 * (the surveyor's notebook, see docs/dev/map.md).
	 */
	survey?: boolean;
	/**
	 * Held in the hand, it pries: jammed crates open, and false walls at the ends of dead ends
	 * down (the crowbar, see docs/dev/items.md#jammed-crates and map-generation.md#false-walls).
	 */
	pry?: boolean;
	/**
	 * Held in the hand, it cuts these: lootables by id (a cocoon, `cocoon`) and, later, things in
	 * the way (`web`). See docs/dev/lootables.md.
	 */
	cuts?: string[];
	/** Held in the hand, it picks locks: trunks and offering boxes, quietly (lockpicks). */
	picks?: boolean;
	/** Held in the hand, it smashes trunks and boxes open, loudly (a sledgehammer). */
	smash?: boolean;
	/** Carried anywhere, it unlocks one locked trunk, and is used up (the key, see items.md). */
	unlocks?: boolean;
	/** Its shots make no sound: nothing hears them, and they add nothing to the noise (a crossbow). */
	silent?: boolean;
	/** It can be used while crawling, where nothing else can (a short spear, a derringer). */
	cramped?: boolean;
	/** It can be used while downed (a derringer). */
	downed?: boolean;
	/** In the hand, it is too heavy to sprint with (a sledgehammer). */
	noSprint?: boolean;
	/** Set down on the floor from the quick-use slot (see PlaceSpec). */
	place?: PlaceSpec;
	/** Held in the hand, it breaks these: `rubble` (a rubble wall: a pickaxe). */
	breaks?: string[];
	/** Worn (gear), it keeps these off: `bites` (a rat nest's), `poison` (a cocoon's). Gloves. */
	protects?: string[];
	/** It breaks on a hard fall (and may, inside something smashed open): gone. A jar. */
	fragile?: boolean;
	/**
	 * Cursed: while it is carried, it takes `sanity` a second and whispers round its carrier (the
	 * porcelain doll). See docs/dev/world.md#cursed-loot.
	 */
	cursed?: { sanity: number };
	/**
	 * Held in the hand, attack takes it (laudanum, grave dirt): `seconds` standing still, then the
	 * condition, and it is used up.
	 */
	dose?: { condition: ConditionId; seconds: number; sound: SoundId };
	/** Worn (defense), it slows a sprint to this share (a leather jerkin). */
	sprint?: number;
	/** Worn (gear), crafting below is possible (the field crafting kit). */
	crafting?: boolean;
	/** Worn (gear), crawling is this much faster and its sound this share as loud (kneepads). */
	crawl?: { speed: number; quiet: number };
	/** Worn (gear), footsteps are this share as loud (felt overshoes). */
	steps?: { quiet: number };
	/** Worn (gear), climbing a rope is this much faster (gloves). */
	climb?: number;
	/** Worn (gear), a bearing on the HUD to the nearest way out (a pocket compass). */
	compass?: boolean;
	/**
	 * Held in the hand, its smoke keeps creatures of these kinds `radius` m away, and adds `noise`
	 * to the noise meter; it wears by the second while held (an incense censer).
	 */
	censer?: { radius: number; repels: string[]; noise: number };
	/** Held, attack blows it: heard `noise` away, the party shown where for `seconds` (a whistle). */
	whistle?: { noise: number; seconds: number };
	/** It doesn't keep: whatever is left of it is gone after the run (bait). */
	spoils?: boolean;
	/** Carried down, a card is drawn at the start of a run: a small blessing or curse (a tarot deck). */
	tarot?: boolean;
	/**
	 * A recipe fragment: read where it lies, never carried (like a clue). Reading it discovers an
	 * ingredient (see `fragmentFinds`, docs/dev/crafting.md#fragments).
	 */
	fragment?: boolean;
	/**
	 * For the rite, it counts as `count` of another item (the black candle: five candles). The
	 * rite takes the real ones first, and this only for what is still wanting.
	 */
	countsAs?: { item: string; count: number };
}

/** How many of most things share a slot. Weapons and defense never stack. */
export const DEFAULT_STACK = 5;

/**
 * The pictures (static/assets/ui/images, built from art/images by `pnpm asset:images`) of the
 * round's items, by item id: the art's file names, which mostly follow the ids.
 */
const PICTURES: Record<string, string> = {
	'recipe-fragment': 'recipe_fragment',
	hatchet: 'hatchet',
	'trench-spade': 'trench_spade',
	'short-spear': 'short_spear',
	'nail-club': 'nail_club',
	pickaxe: 'pickaxe',
	sledgehammer: 'sledgehammer',
	'throwing-knives': 'throwing_knives',
	rifle: 'bolt_action_rifle',
	derringer: 'derringer',
	crossbow: 'crossbow',
	slingshot: 'slingshot',
	'oil-bottle': 'oil_bottle',
	'ammo.rifle': 'rifle_rounds',
	bolts: 'crossbow_bolts',
	jerkin: 'leather_jerkin',
	'crafting-kit': 'field_crafting_kit',
	kneepads: 'kneepads',
	overshoes: 'felt_overshoes',
	gloves: 'gloves',
	compass: 'pocket_compass',
	laudanum: 'laudanum',
	'glow-sticks': 'glow_sticks',
	pitons: 'climbing_pitons',
	lockpicks: 'lockpicks',
	snare: 'snare',
	'tripwire-bell': 'tripwire_bell',
	'blessed-salt': 'blessed_salt',
	firecrackers: 'firecrackers',
	bait: 'bait',
	'grave-dirt': 'grave_dirt',
	censer: 'incense_censer',
	whistle: 'whistle',
	'lamp-oil': 'lamp_oil',
	'rock-salt': 'rock_salt',
	'holy-water': 'holy_water',
	bone: 'bone',
	'gun-oil': 'gun_oil',
	'gun-parts': 'gun_parts',
	pebbles: 'pebbles',
	'silver-snuffbox': 'silver_snuffbox',
	'jet-rosary': 'jet_rosary',
	'cameo-brooch': 'cameo_brooch',
	'funeral-coin': 'funeral_coin',
	'apothecary-jar': 'apothecary_jar',
	medal: 'military_medal',
	tarot: 'tarot_deck',
	garnet: 'uncut_garnet',
	'black-candle': 'black_candle',
	'key-ring': 'key_ring',
	'saints-icon': 'saints_icon',
	ledger: 'keepers_ledger',
	astrolabe: 'brass_astrolabe',
	doll: 'porcelain_doll',
	'crozier-head': 'crozier_head',
	'sealed-reliquary-jar': 'sealed_reliquary_jar'
};

/** Item defs with their pictures from PICTURES (one a def names itself wins). */
function pictured(defs: Record<string, ItemDef>): Record<string, ItemDef> {
	return Object.fromEntries(
		Object.entries(defs).map(([id, def]) => [
			id,
			def.image || !PICTURES[id] ? def : { ...def, image: PICTURES[id] }
		])
	);
}

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
		grip: { pose: 'oneHand', offset: [-0.0111, 0.07, -0.0279], rotation: [1.665, 0.232, 1.181] },
		maxStack: 1,
		weight: 0.3,
		// Never sold now: found or crafted (it sells for 2).
		price: 5,
		durability: { max: 150, per: 'hit' },
		melee: { damage: 18, range: 1.4, arc: 0.55, windup: 0.15, recovery: 0.3, noise: 2, stamina: 4 },
		// It cuts a cocoon open in a few seconds, where bare hands take longer.
		cuts: ['cocoon'],
		// Faster and flatter than a brick, and quieter where it lands: no lure.
		throwable: { speed: 18, damage: 30, landNoise: 4, sound: 'knife.throw', land: 'knife.land' }
	},
	crowbar: {
		id: 'crowbar',
		name: 'Crowbar',
		kind: 'melee',
		category: 'weapon',
		flavor: 'A yard of cold iron. Slow to swing, and nothing gets up quickly after it lands.',
		image: 'crowbar',
		model: modelUrl('shared/items/crowbar.glb'),
		grip: { pose: 'oneHand', offset: [-0.0111, 0.07, -0.0279], rotation: [1.934, 0.73, 1.052] },
		maxStack: 1,
		weight: 2.5,
		price: 60,
		durability: { max: 200, per: 'hit' },
		melee: {
			damage: 40,
			range: 1.8,
			arc: 0.6,
			windup: 0.45,
			recovery: 0.65,
			noise: 6,
			stamina: 10
		},
		pry: true
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
		grip: { pose: 'oneHand', offset: [-0.0148, 0.08, -0.0372], rotation: [1.571, 0, 1.192] },
		maxStack: 1,
		weight: 2.5,
		// Found by rubble; worth nothing.
		value: 0,
		melee: {
			damage: 25,
			range: 1.5,
			arc: 0.5,
			windup: 0.3,
			recovery: 0.5,
			noise: 5,
			breaksAfter: 3,
			stamina: 8
		},
		throwable: { speed: 14, damage: 30, landNoise: 8, sound: 'brick.throw', land: 'brick.land' }
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
		muzzle: [0, 0.045, -0.21],
		grip: { pose: 'oneHand', offset: [-0.025, 0.07, -0.0223], rotation: [1.571, 0, 1.192] },
		maxStack: 1,
		weight: 1.1,
		price: 150,
		durability: { max: 400, per: 'shot' },
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
			recoil: { pitch: 0.035, yaw: 0.012 }
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
		muzzle: [0, 0.05, -0.7],
		grip: { pose: 'twoHand', offset: [-0.0111, 0.07, -0.0279], rotation: [1.571, 0, 1.192] },
		maxStack: 1,
		weight: 3.2,
		price: 250,
		durability: { max: 250, per: 'shot' },
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
			// A real shove: about 9 degrees up, and the gun slams back into your shoulder.
			recoil: { pitch: 0.15, yaw: 0.05 }
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
		maxStack: 30,
		weight: 0.015,
		price: 2
	},
	'ammo.shotgun': {
		id: 'ammo.shotgun',
		name: 'Shotgun shells',
		kind: 'ammo',
		category: 'other',
		flavor: 'Paper-cased shells for the shotgun. Keep them dry.',
		image: 'shotgun_shells',
		model: modelUrl('shared/items/ammo-shotgun.glb'),
		maxStack: 20,
		weight: 0.045,
		price: 4
	},
	bandage: {
		id: 'bandage',
		name: 'Bandage',
		kind: 'consumable',
		category: 'quick',
		flavor: 'Clean linen. Binding something, even a small thing, steadies the mind.',
		image: 'bandages',
		model: modelUrl('shared/items/bandage.glb'),
		grip: { pose: 'item', offset: [-0.0166, 0.075, -0.0418], rotation: [1.571, 0, 2.763] },
		maxStack: DEFAULT_STACK,
		weight: 0.05,
		price: 15,
		heal: { amount: 25, seconds: 3 }
	},
	// Rare: everything a bandage does and more, all at once (a full refill of sanity).
	medkit: {
		id: 'medkit',
		name: 'Medkit',
		kind: 'consumable',
		category: 'quick',
		flavor:
			'A tin case of field dressings, iodine and a little morphine. Enough to put anyone back together, once.',
		image: 'medkit',
		model: modelUrl('shared/items/medkit.glb'),
		grip: { pose: 'item', offset: [-0.0148, 0.08, -0.0372], rotation: [0, -2.763, -1.571] },
		maxStack: 2,
		weight: 0.6,
		price: 60,
		rarity: 'rare',
		heal: { amount: SANITY.max, seconds: 5, kneel: true }
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
		grip: { pose: 'item', offset: [-0.0129, 0.075, -0.0325], rotation: [1.571, 0, 2.763] },
		maxStack: DEFAULT_STACK,
		weight: 0.15,
		price: 20,
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
		grip: { pose: 'item', offset: [-0.0092, 0.075, -0.0232], rotation: [1.571, 0, 2.763] },
		maxStack: DEFAULT_STACK,
		weight: 0.05,
		price: 40,
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
		grip: { pose: 'item', offset: [-0.0166, 0.09, -0.0418], rotation: [1.571, 0, 2.763] },
		maxStack: DEFAULT_STACK,
		weight: 0.01,
		price: 5,
		chalk: { marks: 1 }
	},
	// Rope (docs/dev/rope.md). The store sells packs; bundles are only found below, and rope picked
	// back up comes back as a bundle of what was gathered.
	'rope-pack': {
		id: 'rope-pack',
		name: 'Rope pack',
		kind: 'consumable',
		category: 'quick',
		flavor:
			'A hundred metres of hemp, bound tight. Tie it off at a drop, or pay it out behind you to find the way back.',
		image: 'rope_pack',
		model: modelUrl('shared/items/rope_pack.glb'),
		grip: { pose: 'item', offset: [-0.0296, 0.08, -0.0743], rotation: [1.571, 0, 2.763] },
		maxStack: 1,
		weight: 4,
		price: 50,
		rope: { length: 100 }
	},
	'rope-bundle': {
		id: 'rope-bundle',
		name: 'Rope bundle',
		kind: 'consumable',
		category: 'quick',
		flavor: 'A loose heap of old rope, still sound. Someone came down here meaning to climb.',
		image: 'rope_bundle',
		model: modelUrl('shared/items/rope_bundle.glb'),
		grip: { pose: 'item', offset: [-0.0296, 0.08, -0.0743], rotation: [1.571, 0, 2.763] },
		maxStack: 1,
		weight: 1.6,
		// Never sold: found, or made from rope lengths.
		value: 15,
		rarity: 'rare',
		rope: { length: 40 }
	},
	// Your map: without one there is none to open (see docs/dev/map.md).
	notebook: {
		id: 'notebook',
		name: "Surveyor's notebook",
		kind: 'consumable',
		category: 'other',
		flavor:
			'Squared paper and a stub of pencil. What you draw in it is all you will know of the way back.',
		image: 'notebook',
		model: modelUrl('shared/items/notebook.glb'),
		maxStack: 1,
		weight: 0.3,
		price: 35,
		survey: true
	},
	// Opens one locked trunk on the third level, and is used up (see docs/dev/items.md).
	key: {
		id: 'key',
		name: 'Iron key',
		kind: 'consumable',
		category: 'other',
		flavor: 'Heavy, toothed and black with age. Somewhere down here is the lock it was made for.',
		image: 'key',
		model: modelUrl('shared/items/key.glb'),
		maxStack: DEFAULT_STACK,
		weight: 0.15,
		rarity: 'rare',
		unlocks: true
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
		maxStack: DEFAULT_STACK,
		weight: 0.08,
		price: 4
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
		maxStack: 1,
		weight: 2,
		price: 90,
		durability: { max: 40, per: 'point' },
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
		maxStack: 1,
		weight: 1.8,
		value: 300,
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
		maxStack: 1,
		weight: 3,
		value: 800,
		rarity: 'legendary'
	},
	// Once the Gloaming's rite needed it (docs/dev/rite.md); now it is only worth something.
	pendant: {
		id: 'pendant',
		name: 'The Pendant',
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor: 'Heavier than it should be, and never quite warm.',
		image: 'pendant',
		model: modelUrl('shared/items/pendant.glb'),
		maxStack: 1,
		weight: 0.2,
		value: 150,
		rarity: 'rare'
	},
	// Quest items (docs/dev/quests.md): what Fontaine asks for, and what opens the way.
	'powder-flask': {
		id: 'powder-flask',
		name: 'Powder flask',
		kind: 'material',
		category: 'material',
		flavor: "A horn flask of black powder, Fontaine's father's. For emergencies.",
		model: null,
		placeholder: { size: [0.08, 0.16, 0.05], color: 0x5a4632 },
		maxStack: 1,
		weight: 0.4,
		price: 120
	},
	'oath-rubbing': {
		id: 'oath-rubbing',
		name: 'Rubbing of the oath',
		kind: 'rite',
		category: 'other',
		quest: true,
		flavor: 'Charcoal on paper, taken from a wall of bone. Words cut by a careful hand.',
		model: null,
		placeholder: { size: [0.3, 0.01, 0.4], color: 0xd8d0bc },
		maxStack: 1,
		weight: 0.05
	},
	'carters-ledger': {
		id: 'carters-ledger',
		name: "The Carters' ledger",
		kind: 'rite',
		category: 'other',
		quest: true,
		flavor: 'Swollen with water, sealed in a strongbox. Columns of goods, and names.',
		model: null,
		placeholder: { size: [0.2, 0.05, 0.28], color: 0x4a3626 },
		maxStack: 1,
		weight: 0.6
	},
	'hand-of-glory': {
		id: 'hand-of-glory',
		name: 'Hand of Glory',
		kind: 'rite',
		category: 'other',
		quest: true,
		flavor:
			'A dried hand, its fingers dipped in tallow and burned down to the knuckle. A thief kept sleepers sleeping with it.',
		model: null,
		placeholder: { size: [0.1, 0.2, 0.06], color: 0x6e5a44 },
		maxStack: 1,
		weight: 0.4
	},
	'lamplighters-lantern': {
		id: 'lamplighters-lantern',
		name: "The Lamplighter's Lantern",
		kind: 'rite',
		category: 'other',
		quest: true,
		flavor: 'Iron and horn, and still burning. It is very cold to hold.',
		model: null,
		placeholder: { size: [0.16, 0.3, 0.16], color: 0xe0b050 },
		maxStack: 1,
		weight: 1.5,
		// It belongs in his tomb: it doesn't come up with you.
		spoils: true
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
		maxStack: 0,
		weight: 0
	},
	// Read where it lies (docs/dev/crafting.md#fragments): a torn manual page, a gunsmith's notes.
	'recipe-fragment': {
		id: 'recipe-fragment',
		name: 'Recipe fragment',
		kind: 'loot',
		category: 'other',
		flavor: 'A torn page of notes: how someone down here made do.',
		image: 'recipe_fragment',
		model: null,
		placeholder: { size: [0.2, 0.01, 0.28], color: 0xc8bc9c },
		maxStack: 0,
		weight: 0,
		fragment: true
	},
	...pictured(WEAPONS),
	...pictured(GEAR),
	...pictured(QUICK),
	...pictured(MATERIALS),
	...pictured(TREASURE)
};

/**
 * Bare hands: what swings when nothing is in the hand (an empty weapon slot, or an empty quick-use
 * slot taken in hand). Not an item: never carried, dropped, sold or listed, and not in ITEMS. It
 * goes through the same swing as any melee weapon, under its own id (`swing` events carry
 * `hands`), so look it up with `heldDef`. A last resort: weak, short, and tiring. See
 * docs/dev/combat.md#bare-hands.
 */
export const HANDS: ItemDef = {
	id: 'hands',
	name: 'Bare hands',
	kind: 'melee',
	category: 'weapon',
	flavor: 'Nothing in your hands but your hands.',
	model: null,
	maxStack: 0,
	weight: 0,
	melee: {
		damage: 8,
		range: 1.2,
		arc: 0.5,
		windup: 0.12,
		recovery: 0.38,
		noise: 1.5,
		stamina: 5,
		// Silent: the blow is heard in what it hits (a creature's hurt), and by creatures (`noise`).
		sound: { swing: null, hit: null }
	}
};

/** The def of what is in a hand or behind a swing: an item, or bare hands (`HANDS.id`). */
export function heldDef(item: string | null | undefined): ItemDef | undefined {
	if (!item) return undefined;
	return item === HANDS.id ? HANDS : ITEMS[item];
}

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
