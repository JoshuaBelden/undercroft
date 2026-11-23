import type { SoundId } from './audio/sounds.ts';
import type { Rarity } from './items.ts';
import type { ConditionId } from './player/conditions.ts';
import { modelUrl } from './models.ts';

/**
 * Lootables (data): everything in the map that is searched for loot, the crate and the corpse and
 * the trunk among them. Each says how it looks (its model, or a box until it has one), how it
 * opens (by hand, with a tool, with a key), what it makes heard, what it holds (its own table and
 * how many of each rarity, level by level) and the lines the game shows. Where they stand: crate
 * and `lootable-<type>-<n>` markers in the pieces (src/lib/shared/map/crates.ts). The rules that
 * read this are in src/lib/shared/items/lootables.ts. See docs/dev/lootables.md.
 */

export type LootableId =
	| 'crate'
	| 'corpse'
	| 'trunk'
	| 'niche'
	| 'bonePile'
	| 'sarcophagus'
	| 'toolChest'
	| 'locker'
	| 'satchel'
	| 'offeringBox'
	| 'vestryCabinet'
	| 'ratNest'
	| 'cocoon'
	| 'stash'
	| 'cache'
	| 'alcove'
	| 'font'
	| 'dropBox';

/**
 * What a way of opening takes in the hand: something that pries (`pry`, the crowbar), cuts this
 * lootable (`cuts` naming it: a blade for a cocoon), picks locks (`picks`) or smashes (`smash`).
 * An item has the tool when its def says so (`hasTool` in src/lib/shared/items/lootables.ts).
 */
export type LootTool = 'pry' | 'cut' | 'picks' | 'smash';

/** One way of getting a lootable open. The fastest one the player can use is the one used. */
export interface OpenWay {
	/** Held in the hand, not broken. None: bare hands. */
	tool?: LootTool;
	/** A key carried anywhere turns it, at once, and is used up (`ItemDef.unlocks`). */
	key?: true;
	/** Seconds interact is held. A key takes none: a press. */
	seconds: number;
	/** What the prompt says after the key: "to search", "Pry", "Push the lid". */
	verb: string;
	/** Radius (m) the work is heard while it goes on, from the start and every `every` seconds. */
	noise?: number;
	every?: number;
	/** It takes this many players at it at once (two on a stone lid). */
	together?: number;
	/** Opened this way (smashed), each fragile thing inside breaks with this chance. */
	breaks?: number;
}

/**
 * What can go wrong going through one (docs/dev/world.md#catches): a bite or a condition each
 * time someone reaches in, unless what they wear `protects` against it (gloves); creatures that
 * come out of it the first time, with a chance (a rat swarm from a bone pile, spiders from a
 * sarcophagus's egg sac).
 */
export type LootCatch =
	| { kind: 'bite'; damage: number; unless: string }
	| { kind: 'condition'; condition: ConditionId; seconds: number; unless: string }
	| { kind: 'spawn'; creature: string; count: [number, number]; chance: number };

/** How many things of each rarity it holds: the fewest and most, and the chance of each more. */
export type RarityCounts = Record<Rarity, { count: [number, number]; chance: [number, number] }>;

/** What it can hold: an item, how many come together, and its weight shallow and deep. */
export interface LootEntry {
	/** Key into ITEMS. Its rarity decides which of the lootable's picks it competes for. */
	item: string;
	/** How many come together, lowest and highest (never more than the item's stack). */
	count: [number, number];
	/**
	 * Relative chance among items of the same rarity: near the start of its level, and at the far
	 * end of it. In between it slides from one to the other.
	 */
	weight: [number, number];
}

export interface LootableDef {
	id: LootableId;
	/** What it is called: the loot screen's title. */
	name: string;
	/** Shown under the title when it is opened, one picked by the lootable's id. */
	flavor: string[];
	/** Its model (built into static/assets/shared/props), or null: a box of `color`. */
	model: string | null;
	color: number;
	/**
	 * Its footprint and height: across (along the wall), high, deep (out from the wall), in m. It
	 * stands with its back where the marker's wall is.
	 */
	size: [number, number, number];
	/** Part of the collision world, like a crate; otherwise stepped over, like a body. */
	solid: boolean;
	/** Height (m) of its middle, looked at to open it; half its height when left out. */
	lookHeight?: number;
	/** It lies under water (a sunken satchel): where it stands may be in a water volume. */
	wet?: boolean;
	/** Slots on the loot screen. */
	slots: number;
	/** How it opens. Empty: only when sealed (`sealed`). */
	open: OpenWay[];
	/**
	 * Some are sealed (a jammed crate, a sealed niche, a locked trunk), and open only these ways.
	 * `hidden`: it looks like the rest until someone tries it (a jammed crate). `note` follows the
	 * prompt once it is known ("crate stuck"). `rarity`: a sealed one holds better things.
	 */
	sealed?: {
		chance: number;
		hidden: boolean;
		note: string;
		open: OpenWay[];
		rarity?: RarityCounts[];
	};
	/** Radius (m) the first opening is heard; and each thing taken out of it (or put in). */
	noise: number;
	lootNoise: number;
	/** Played as it is first opened. */
	sound: SoundId;
	/** Its loot table: what it can hold. Entries for items not in the game yet are skipped. */
	loot: LootEntry[];
	/** How many things of each rarity, by level of the map (first level first). */
	rarity: RarityCounts[];
	/**
	 * It always holds something epic or legendary (a trunk, an alcove): if it rolled neither, one
	 * is added, legendary with this chance.
	 */
	prize?: number;
	/**
	 * Hidden (docs/dev/world.md#stashes): nobody can open it, or is told it is there, until
	 * someone has looked at it (its chalk sign) from within `reach` m for `seconds`. A
	 * smuggler's stash.
	 */
	hidden?: { reach: number; seconds: number };
	/**
	 * Not opened but filled from (docs/dev/world.md#fonts): holding interact with a `needs` in the
	 * pack turns one into a `makes` over `seconds`, a few times (`fills`, rolled per map) before
	 * it runs dry. A font: a glass bottle into holy water. Left out of maps until `needs` exists.
	 */
	fill?: { needs: string; makes: string; seconds: number; fills: [number, number]; verb: string };
	/** What can go wrong going through it. */
	catches?: LootCatch[];
	/** Opening it the first time feeds the Affliction's meter this much (0..1: a reliquary). */
	meter?: number;
	/** The lid (a part of its model, turned about its X axis by `angle`) goes up when opened. */
	lid?: { part: string; angle: number };
	/**
	 * Never part of a map: made where an explorer drops something (a drop box, DROP_BOXES in
	 * loot.ts). It rolls no loot and has no marker in any room.
	 */
	dropped?: true;
}

/** Nothing of a rarity. */
const NONE = { count: [0, 0] as [number, number], chance: [0, 0] as [number, number] };

/** Rarity counts, with every rarity left out at none. */
function counts(given: Partial<RarityCounts>): RarityCounts {
	return {
		common: NONE,
		uncommon: NONE,
		rare: NONE,
		epic: NONE,
		legendary: NONE,
		...given
	};
}

/** The same counts on every level. */
function everyLevel(c: RarityCounts): RarityCounts[] {
	return [c, c, c];
}

/**
 * A crate's counts (tuned for about 30 a map, ten on each level: a few rares, an epic in about
 * half of maps, a legendary in about one in five, all on the third level). The first two levels
 * have only the everyday things.
 */
const CRATE: RarityCounts = counts({
	common: { count: [1, 4], chance: [0.25, 0.45] },
	uncommon: { count: [0, 2], chance: [0.12, 0.25] },
	rare: { count: [0, 1], chance: [0.1, 0.28] },
	epic: { count: [0, 1], chance: [0.02, 0.075] },
	legendary: { count: [0, 1], chance: [0.006, 0.032] }
});
const CRATE_SHALLOW = counts({ common: CRATE.common, uncommon: CRATE.uncommon });

/** Shorthand for a table line. */
const entry = (
	item: string,
	count: [number, number],
	weight: [number, number] = [1, 1]
): LootEntry => ({ item, count, weight });

/** The mixed table (crates, and things lying loose). */
const MIXED: LootEntry[] = [
	entry('coins', [2, 8], [10, 8]),
	entry('rosary', [1, 1], [6, 6]),
	entry('bandage', [1, 2], [3, 3]),
	entry('medkit', [1, 1], [1, 2]),
	entry('ammo.revolver', [3, 8], [2, 3]),
	entry('ammo.shotgun', [2, 5], [1, 2]),
	entry('salts', [1, 1], [1, 2]),
	entry('chalk', [1, 2], [3, 2]),
	entry('rope-bundle', [1, 1], [2, 2]),
	entry('candle', [1, 3], [4, 3]),
	entry('tooth', [1, 2], [5, 4]),
	entry('signet', [1, 1], [3, 4]),
	entry('battery', [1, 1], [5, 5]),
	entry('candlestick', [1, 1], [1, 1]),
	entry('chalice', [1, 1], [1, 1]),
	entry('relic', [1, 1], [1, 1]),
	entry('rags', [1, 3], [3, 2]),
	entry('twine', [1, 2], [2, 2]),
	entry('glass-bottle', [1, 1], [2, 2]),
	entry('nail-club', [1, 1], [1, 1]),
	entry('slingshot', [1, 1], [1, 1]),
	entry('firecrackers', [1, 2], [2, 2]),
	entry('bait', [1, 1], [2, 2]),
	entry('apothecary-jar', [1, 1], [1, 1]),
	entry('tarot', [1, 1], [0, 1]),
	entry('doll', [1, 1], [0, 1])
];

/** Burial goods: what the dead were laid to rest with. */
const BURIAL: LootEntry[] = [
	entry('coins', [2, 6], [8, 6]),
	entry('rosary', [1, 1], [6, 5]),
	entry('signet', [1, 1], [3, 4]),
	entry('candlestick', [1, 1], [2, 3]),
	entry('chalice', [1, 1], [1, 2]),
	entry('cameo-brooch', [1, 1], [2, 3]),
	entry('jet-rosary', [1, 1], [2, 3]),
	entry('saints-icon', [1, 1], [1, 2]),
	entry('wood', [1, 2], [3, 2])
];

export const LOOTABLES: Record<LootableId, LootableDef> = {
	crate: {
		id: 'crate',
		name: 'Crate',
		flavor: [
			'Packing crate, nailed shut once and broken open since.',
			'Stencilled with a merchant’s mark, too worn to read.'
		],
		model: modelUrl('shared/props/crate.glb'),
		color: 0x5a4632,
		// A little higher than the model, so nothing counts its lid as a step.
		size: [0.94, 0.55, 0.64],
		solid: true,
		slots: 8,
		open: [{ seconds: 1, verb: 'to search' }],
		// About a quarter are jammed: it takes a crowbar in the hand (docs/dev/items.md#jammed-crates).
		sealed: {
			chance: 0.25,
			hidden: true,
			note: 'crate stuck',
			open: [{ tool: 'pry', seconds: 6, verb: 'Pry', noise: 10, every: 2 }]
		},
		noise: 6,
		lootNoise: 4,
		sound: 'crate.open',
		loot: MIXED,
		rarity: [CRATE_SHALLOW, CRATE_SHALLOW, CRATE],
		lid: { part: 'crate-lid', angle: 1.9 }
	},
	corpse: {
		id: 'corpse',
		name: 'Dead explorer',
		flavor: [
			'Their lamp is still on their head, cold.',
			'They were heading out. They didn’t get far.'
		],
		model: modelUrl('shared/props/corpse.glb'),
		color: 0x3d3a34,
		// The built model's footprint. Not solid: you step over it.
		size: [1.3, 0.52, 1.05],
		solid: false,
		lookHeight: 0.2,
		slots: 8,
		open: [{ seconds: 2, verb: 'Search the body' }],
		noise: 3,
		lootNoise: 3,
		sound: 'corpse.search',
		// The main source of ammo, gun parts and recipe fragments.
		loot: [
			entry('ammo.revolver', [3, 8], [4, 5]),
			entry('ammo.shotgun', [2, 5], [2, 3]),
			entry('battery', [1, 1], [5, 5]),
			entry('bandage', [1, 2], [4, 3]),
			entry('medkit', [1, 1], [1, 2]),
			entry('salts', [1, 1], [1, 2]),
			entry('chalk', [1, 2], [2, 2]),
			entry('rope-bundle', [1, 1], [1, 2]),
			entry('coins', [1, 6], [4, 4]),
			entry('tooth', [1, 1], [2, 2]),
			entry('rope-length', [1, 2], [3, 3]),
			entry('leather', [1, 2], [3, 3]),
			entry('gun-parts', [1, 1], [0, 3]),
			entry('gun-oil', [1, 1], [0, 2]),
			entry('recipe-fragment', [1, 1], [1, 2]),
			entry('short-spear', [1, 1], [1, 1]),
			entry('nail-club', [1, 1], [1, 1]),
			entry('throwing-knives', [1, 3], [1, 2]),
			entry('derringer', [1, 1], [0, 1]),
			entry('crossbow', [1, 1], [0, 1]),
			entry('bolts', [2, 4], [1, 2]),
			entry('rifle', [1, 1], [0, 1]),
			entry('ammo.rifle', [2, 5], [0, 2]),
			entry('jerkin', [1, 1], [0, 1]),
			entry('crafting-kit', [1, 1], [1, 1]),
			entry('kneepads', [1, 1], [1, 1]),
			entry('overshoes', [1, 1], [1, 1]),
			entry('gloves', [1, 1], [1, 1]),
			entry('compass', [1, 1], [0, 1]),
			entry('laudanum', [1, 1], [1, 1]),
			entry('glow-sticks', [1, 3], [3, 2]),
			entry('pitons', [1, 3], [1, 1]),
			entry('lockpicks', [1, 2], [1, 1]),
			entry('whistle', [1, 1], [1, 1]),
			entry('medal', [1, 1], [1, 1]),
			entry('key-ring', [1, 1], [0, 1])
		],
		rarity: [CRATE_SHALLOW, CRATE_SHALLOW, CRATE]
	},
	trunk: {
		id: 'trunk',
		name: 'Locked trunk',
		flavor: ['Iron-bound and heavy. Someone meant this to stay shut.'],
		model: modelUrl('shared/props/trunk.glb'),
		color: 0x4b3a26,
		// Matching the built model (PROP_FIT).
		size: [0.9, 0.73, 0.67],
		solid: true,
		slots: 8,
		open: [{ seconds: 1, verb: 'to search' }],
		// Always locked: a key, picks, or a sledgehammer (docs/dev/items.md#locked-trunks).
		sealed: {
			chance: 1,
			hidden: false,
			note: 'locked',
			open: [
				{ key: true, seconds: 0, verb: 'Unlock' },
				{ tool: 'picks', seconds: 6, verb: 'Pick the lock' },
				{ tool: 'smash', seconds: 2, verb: 'Smash it open', noise: 16, breaks: 0.25 }
			]
		},
		noise: 3,
		lootNoise: 4,
		sound: 'crate.open',
		loot: [
			...MIXED,
			...BURIAL.filter((e) => !MIXED.some((m) => m.item === e.item)),
			entry('medal', [1, 1], [2, 2]),
			entry('tarot', [1, 1], [1, 1]),
			entry('garnet', [1, 1], [2, 2]),
			entry('key-ring', [1, 1], [1, 1]),
			entry('ledger', [1, 1], [1, 1]),
			entry('astrolabe', [1, 1], [1, 1]),
			entry('doll', [1, 1], [1, 1])
		],
		// Rare to legendary, on whatever level it stands.
		rarity: everyLevel(
			counts({
				common: { count: [1, 3], chance: [0.3, 0.4] },
				uncommon: { count: [0, 2], chance: [0.25, 0.35] },
				rare: { count: [1, 2], chance: [0.2, 0.35] }
			})
		),
		prize: 0.25
	},
	niche: {
		id: 'niche',
		name: 'Wall niche',
		flavor: [
			'Someone was laid here with what they couldn’t bear to leave.',
			'The slab is cracked. Something glints behind it.'
		],
		model: null,
		color: 0x6b6253,
		size: [0.7, 0.45, 0.35],
		solid: true,
		slots: 4,
		open: [{ seconds: 1, verb: 'Search the niche' }],
		// Sealed ones need a crowbar, and hold better burial goods.
		sealed: {
			chance: 0.3,
			hidden: false,
			note: 'sealed',
			open: [{ tool: 'pry', seconds: 4, verb: 'Pry the slab', noise: 8, every: 2 }],
			rarity: [
				counts({
					common: { count: [1, 2], chance: [0.4, 0.5] },
					uncommon: { count: [1, 2], chance: [0.3, 0.4] }
				}),
				counts({
					common: { count: [1, 2], chance: [0.4, 0.5] },
					uncommon: { count: [1, 2], chance: [0.3, 0.4] },
					rare: { count: [0, 1], chance: [0.08, 0.16] }
				}),
				counts({
					common: { count: [1, 2], chance: [0.4, 0.5] },
					uncommon: { count: [1, 2], chance: [0.3, 0.4] },
					rare: { count: [0, 1], chance: [0.15, 0.3] },
					epic: { count: [0, 1], chance: [0.02, 0.05] }
				})
			]
		},
		noise: 2,
		lootNoise: 2,
		sound: 'lootable.niche',
		loot: [
			entry('bone', [1, 3], [5, 4]),
			entry('wax', [1, 2], [4, 3]),
			entry('candle', [1, 1], [2, 2]),
			entry('coins', [1, 4], [6, 5]),
			entry('rosary', [1, 1], [5, 5]),
			entry('tooth', [1, 1], [2, 2]),
			entry('signet', [1, 1], [2, 3]),
			entry('jet-rosary', [1, 1], [1, 2]),
			entry('cameo-brooch', [1, 1], [1, 1]),
			entry('candlestick', [1, 1], [1, 2]),
			entry('grave-dirt', [1, 1], [1, 1]),
			entry('garnet', [1, 1], [1, 1])
		],
		rarity: [
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [0, 1], chance: [0.1, 0.18] }
			}),
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [0, 1], chance: [0.12, 0.2] }
			}),
			counts({
				common: { count: [1, 2], chance: [0.3, 0.45] },
				uncommon: { count: [0, 1], chance: [0.15, 0.25] },
				rare: { count: [0, 1], chance: [0.04, 0.1] }
			})
		]
	},
	bonePile: {
		id: 'bonePile',
		name: 'Bone pile',
		flavor: [
			'Femurs, skulls, the small bones of hands. Not all of it is old.',
			'It shifts as you touch it, and keeps shifting after.'
		],
		model: modelUrl('shared/props/bone_pile.glb'),
		color: 0xbdb39a,
		// Matching the built model (PROP_FIT).
		size: [0.91, 0.21, 0.88],
		solid: false,
		slots: 4,
		open: [{ seconds: 3, verb: 'Rummage' }],
		catches: [{ kind: 'spawn', creature: 'rat', count: [3, 5], chance: 0.2 }],
		noise: 10,
		lootNoise: 4,
		sound: 'lootable.bones',
		loot: [
			entry('bone', [1, 4], [6, 5]),
			entry('tooth', [1, 2], [5, 5]),
			entry('coins', [1, 4], [5, 4]),
			entry('rosary', [1, 1], [2, 2]),
			entry('grave-dirt', [1, 1], [1, 2]),
			entry('rock-salt', [1, 1], [1, 1])
		],
		rarity: [
			counts({
				common: { count: [1, 3], chance: [0.3, 0.4] },
				uncommon: { count: [0, 1], chance: [0.15, 0.25] }
			}),
			counts({
				common: { count: [1, 3], chance: [0.3, 0.4] },
				uncommon: { count: [0, 1], chance: [0.2, 0.3] }
			}),
			counts({
				common: { count: [1, 3], chance: [0.3, 0.45] },
				uncommon: { count: [0, 1], chance: [0.2, 0.3] },
				rare: { count: [0, 1], chance: [0.05, 0.12] }
			})
		]
	},
	sarcophagus: {
		id: 'sarcophagus',
		name: 'Sarcophagus',
		flavor: [
			'The name has been chiselled off.',
			'Stone grinds on stone. Whatever is inside has waited a long time.'
		],
		model: null,
		color: 0x7d776a,
		// Lying along the wall.
		size: [2.0, 0.8, 0.9],
		solid: true,
		slots: 6,
		// A crowbar under the lid, or two players pushing it together.
		open: [
			{ tool: 'pry', seconds: 6, verb: 'Push the lid', noise: 12, every: 3 },
			{ together: 2, seconds: 6, verb: 'Push the lid', noise: 12, every: 3 }
		],
		catches: [{ kind: 'spawn', creature: 'spider', count: [2, 3], chance: 0.15 }],
		noise: 12,
		lootNoise: 3,
		sound: 'lootable.lid',
		loot: [
			...BURIAL,
			entry('grave-dirt', [1, 1], [2, 2]),
			entry('censer', [1, 1], [0, 1]),
			entry('ledger', [1, 1], [0, 1])
		],
		rarity: [
			counts({
				common: { count: [1, 2], chance: [0.35, 0.45] },
				uncommon: { count: [1, 2], chance: [0.25, 0.35] },
				rare: { count: [0, 1], chance: [0.06, 0.12] }
			}),
			counts({
				common: { count: [1, 2], chance: [0.35, 0.45] },
				uncommon: { count: [1, 2], chance: [0.3, 0.4] },
				rare: { count: [0, 1], chance: [0.15, 0.3] },
				epic: { count: [0, 1], chance: [0.02, 0.05] }
			}),
			counts({
				common: { count: [1, 2], chance: [0.35, 0.45] },
				uncommon: { count: [1, 2], chance: [0.3, 0.4] },
				rare: { count: [0, 1], chance: [0.25, 0.4] },
				epic: { count: [0, 1], chance: [0.05, 0.12] }
			})
		]
	},
	toolChest: {
		id: 'toolChest',
		name: 'Quarrymen’s tool chest',
		flavor: [
			'Stamped with a company name that went under a hundred years ago.',
			'Picks, wedges, and a lunch tin nobody came back for.'
		],
		model: null,
		color: 0x4e5a3c,
		size: [1.0, 0.6, 0.55],
		solid: true,
		slots: 8,
		open: [{ seconds: 3, verb: 'Pry it open' }],
		noise: 8,
		lootNoise: 4,
		sound: 'lootable.chest',
		// The material motherlode.
		loot: [
			entry('metal', [1, 3], [6, 5]),
			entry('wood', [1, 3], [5, 4]),
			entry('nails', [10, 10], [4, 4]),
			entry('lamp-oil', [1, 1], [2, 3]),
			entry('rock-salt', [1, 2], [2, 2]),
			entry('twine', [1, 2], [4, 3]),
			entry('rope-length', [1, 2], [2, 2]),
			entry('chalk', [1, 2], [2, 2]),
			entry('battery', [1, 1], [2, 2]),
			entry('pickaxe', [1, 1], [0, 1]),
			entry('hatchet', [1, 1], [1, 1]),
			entry('trench-spade', [1, 1], [1, 1]),
			entry('sledgehammer', [1, 1], [0, 1]),
			entry('pitons', [1, 3], [2, 2]),
			entry('lockpicks', [1, 2], [1, 1]),
			entry('snare', [1, 1], [2, 2]),
			entry('gloves', [1, 1], [1, 1])
		],
		rarity: [
			counts({
				common: { count: [2, 4], chance: [0.3, 0.4] },
				uncommon: { count: [0, 2], chance: [0.15, 0.25] }
			}),
			counts({
				common: { count: [2, 4], chance: [0.3, 0.45] },
				uncommon: { count: [0, 2], chance: [0.2, 0.3] },
				rare: { count: [0, 1], chance: [0.02, 0.06] }
			}),
			counts({
				common: { count: [2, 4], chance: [0.35, 0.5] },
				uncommon: { count: [0, 2], chance: [0.2, 0.3] },
				rare: { count: [0, 1], chance: [0.04, 0.1] }
			})
		]
	},
	locker: {
		id: 'locker',
		name: 'Workman’s locker',
		flavor: [
			'A calendar inside the door, stopped on a month long gone.',
			'Somebody kept this one tidy, right to the end.'
		],
		model: null,
		color: 0x55605f,
		size: [0.6, 1.8, 0.5],
		solid: true,
		lookHeight: 1.1,
		slots: 6,
		open: [{ seconds: 0.5, verb: 'Open the locker' }],
		noise: 4,
		lootNoise: 3,
		sound: 'lootable.locker',
		// Low value, always useful.
		loot: [
			entry('rags', [1, 3], [5, 4]),
			entry('twine', [1, 2], [4, 4]),
			entry('rubber', [1, 1], [2, 3]),
			entry('rope-length', [1, 2], [3, 3]),
			entry('battery', [1, 1], [5, 5]),
			entry('glow-sticks', [1, 3], [3, 3]),
			entry('chalk', [1, 2], [4, 3]),
			entry('bandage', [1, 1], [3, 3]),
			entry('candle', [1, 2], [2, 2]),
			entry('coins', [1, 3], [2, 2]),
			entry('lamp-oil', [1, 1], [2, 2]),
			entry('firecrackers', [1, 2], [2, 2]),
			entry('tripwire-bell', [1, 1], [1, 1]),
			entry('whistle', [1, 1], [1, 1]),
			entry('oil-bottle', [1, 1], [1, 1]),
			entry('kneepads', [1, 1], [1, 1]),
			entry('overshoes', [1, 1], [1, 1]),
			entry('slingshot', [1, 1], [1, 1])
		],
		rarity: everyLevel(
			counts({
				common: { count: [1, 3], chance: [0.3, 0.45] },
				uncommon: { count: [0, 2], chance: [0.2, 0.3] }
			})
		)
	},
	satchel: {
		id: 'satchel',
		name: 'Sunken satchel',
		flavor: ['Swollen leather, heavy with water and whatever it held.'],
		model: null,
		color: 0x3b3222,
		size: [0.45, 0.3, 0.3],
		solid: false,
		wet: true,
		slots: 4,
		open: [{ seconds: 2, verb: 'Search the satchel' }],
		noise: 1,
		lootNoise: 1,
		sound: 'lootable.satchel',
		loot: [
			entry('coins', [2, 8], [8, 6]),
			entry('signet', [1, 1], [3, 3]),
			entry('tooth', [1, 2], [3, 3]),
			entry('glass-bottle', [1, 1], [3, 2]),
			entry('cameo-brooch', [1, 1], [1, 2]),
			entry('silver-snuffbox', [1, 1], [1, 2]),
			entry('candlestick', [1, 1], [1, 1]),
			entry('apothecary-jar', [1, 1], [1, 1]),
			entry('medal', [1, 1], [1, 1]),
			entry('garnet', [1, 1], [1, 1]),
			entry('tarot', [1, 1], [0, 1])
		],
		rarity: [
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [0, 2], chance: [0.15, 0.25] }
			}),
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [0, 2], chance: [0.2, 0.3] },
				rare: { count: [0, 1], chance: [0.05, 0.1] }
			}),
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [0, 2], chance: [0.2, 0.3] },
				rare: { count: [0, 1], chance: [0.1, 0.2] }
			})
		]
	},
	offeringBox: {
		id: 'offeringBox',
		name: 'Offering box',
		flavor: ['For the souls below. The slot is worn smooth by fingers.'],
		model: null,
		color: 0x5c3b22,
		size: [0.4, 0.5, 0.3],
		solid: true,
		slots: 3,
		// No way in by hand: picks, quietly, or smashing it.
		open: [
			{ tool: 'picks', seconds: 6, verb: 'Pick the lock' },
			{ tool: 'smash', seconds: 1.5, verb: 'Smash it', noise: 10, breaks: 0.25 }
		],
		noise: 0,
		lootNoise: 2,
		sound: 'lootable.offering.pick',
		// Small but reliable value.
		loot: [
			entry('coins', [4, 12], [8, 8]),
			entry('signet', [1, 1], [3, 3]),
			entry('funeral-coin', [1, 1], [1, 2])
		],
		rarity: everyLevel(
			counts({
				common: { count: [1, 1], chance: [0, 0] },
				uncommon: { count: [0, 1], chance: [0.3, 0.4] },
				rare: { count: [0, 1], chance: [0.08, 0.15] }
			})
		)
	},
	vestryCabinet: {
		id: 'vestryCabinet',
		name: 'Vestry cabinet',
		flavor: ['Candles in neat rows, and a smell of wax and damp.'],
		model: null,
		color: 0x4a3324,
		size: [1.0, 1.6, 0.5],
		solid: true,
		lookHeight: 1,
		slots: 6,
		open: [{ seconds: 0.5, verb: 'Open the cabinet' }],
		noise: 3,
		lootNoise: 2,
		sound: 'lootable.cabinet',
		// Where rite supplies are reliable.
		loot: [
			entry('candle', [2, 5], [8, 8]),
			entry('wax', [1, 3], [4, 4]),
			entry('chalk', [1, 2], [3, 3]),
			entry('holy-water', [1, 1], [2, 3]),
			entry('black-candle', [1, 1], [1, 2]),
			entry('chalice', [1, 1], [1, 2]),
			entry('blessed-salt', [1, 1], [2, 2]),
			entry('censer', [1, 1], [1, 1])
		],
		rarity: [
			counts({
				common: { count: [1, 3], chance: [0.4, 0.5] },
				uncommon: { count: [0, 1], chance: [0.2, 0.3] }
			}),
			counts({
				common: { count: [1, 3], chance: [0.4, 0.5] },
				uncommon: { count: [0, 1], chance: [0.25, 0.35] }
			}),
			counts({
				common: { count: [1, 3], chance: [0.4, 0.5] },
				uncommon: { count: [0, 1], chance: [0.25, 0.35] },
				epic: { count: [0, 1], chance: [0.03, 0.08] }
			})
		]
	},
	ratNest: {
		id: 'ratNest',
		name: 'Rat nest',
		flavor: ['Shredded cloth, bones gnawed white, and something that shines.'],
		model: null,
		color: 0x51473a,
		size: [0.9, 0.35, 0.8],
		solid: false,
		slots: 4,
		open: [{ seconds: 4, verb: 'Reach in' }],
		catches: [{ kind: 'bite', damage: 8, unless: 'bites' }],
		noise: 6,
		lootNoise: 3,
		sound: 'lootable.nest',
		loot: [
			entry('coins', [1, 6], [6, 6]),
			entry('tooth', [1, 3], [5, 5]),
			entry('signet', [1, 1], [3, 3]),
			entry('rags', [1, 2], [2, 2]),
			entry('garnet', [1, 1], [1, 1])
		],
		rarity: everyLevel(
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [0, 2], chance: [0.2, 0.35] }
			})
		)
	},
	cocoon: {
		id: 'cocoon',
		name: 'Webbed cocoon',
		flavor: ['Wrapped tight, head to foot. The shape inside is a person.'],
		model: null,
		color: 0xd8d4c4,
		size: [1.8, 0.6, 0.6],
		solid: false,
		lookHeight: 0.3,
		slots: 6,
		// Bare hands, slowly; a blade, quickly.
		open: [
			{ seconds: 5, verb: 'Cut it open' },
			{ tool: 'cut', seconds: 2, verb: 'Cut it open' }
		],
		catches: [
			{ kind: 'condition', condition: 'poisoned', seconds: 8, unless: 'poison' },
			{ kind: 'spawn', creature: 'spider', count: [1, 2], chance: 0.3 }
		],
		noise: 3,
		lootNoise: 3,
		sound: 'lootable.cocoon',
		// A wrapped explorer's gear.
		loot: [
			entry('ammo.revolver', [2, 6], [4, 4]),
			entry('ammo.shotgun', [1, 4], [2, 3]),
			entry('battery', [1, 1], [4, 4]),
			entry('bandage', [1, 2], [3, 3]),
			entry('medkit', [1, 1], [1, 2]),
			entry('rope-bundle', [1, 1], [1, 1]),
			entry('leather', [1, 2], [4, 4]),
			entry('coins', [1, 5], [3, 3]),
			entry('gun-parts', [1, 1], [1, 3]),
			entry('rifle', [1, 1], [0, 1]),
			entry('crossbow', [1, 1], [0, 1]),
			entry('doll', [1, 1], [0, 1])
		],
		rarity: [
			counts({
				common: { count: [1, 3], chance: [0.3, 0.4] },
				uncommon: { count: [0, 2], chance: [0.2, 0.3] }
			}),
			counts({
				common: { count: [1, 3], chance: [0.3, 0.45] },
				uncommon: { count: [0, 2], chance: [0.2, 0.3] },
				rare: { count: [0, 1], chance: [0.05, 0.12] }
			}),
			counts({
				common: { count: [1, 3], chance: [0.3, 0.45] },
				uncommon: { count: [0, 2], chance: [0.25, 0.35] },
				rare: { count: [0, 1], chance: [0.1, 0.2] }
			})
		]
	},
	stash: {
		id: 'stash',
		name: 'Smuggler’s stash',
		flavor: ['A chalk mark only a smuggler would know. The brick moves.'],
		model: null,
		color: 0x7a4b36,
		size: [0.4, 0.3, 0.3],
		solid: false,
		slots: 4,
		open: [{ tool: 'pry', seconds: 3, verb: 'Pry the brick loose', noise: 8 }],
		// You have to notice the chalk sign.
		hidden: { reach: 2.5, seconds: 1.2 },
		noise: 8,
		lootNoise: 2,
		sound: 'lootable.brick',
		loot: [
			entry('ammo.revolver', [4, 10], [5, 5]),
			entry('ammo.shotgun', [2, 6], [3, 4]),
			entry('coins', [3, 10], [5, 5]),
			entry('salts', [1, 1], [2, 2]),
			entry('medkit', [1, 1], [1, 2]),
			entry('laudanum', [1, 1], [1, 2]),
			entry('gun-oil', [1, 1], [2, 3]),
			entry('glass-bottle', [1, 2], [2, 2]),
			entry('derringer', [1, 1], [1, 1]),
			entry('ammo.rifle', [2, 5], [1, 2]),
			entry('lockpicks', [1, 2], [2, 2]),
			entry('oil-bottle', [1, 1], [1, 1])
		],
		rarity: [
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [1, 2], chance: [0.2, 0.3] }
			}),
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [1, 2], chance: [0.25, 0.35] },
				rare: { count: [0, 1], chance: [0.1, 0.2] }
			}),
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [1, 2], chance: [0.25, 0.35] },
				rare: { count: [0, 1], chance: [0.15, 0.3] }
			})
		]
	},
	cache: {
		id: 'cache',
		name: 'Surveyor’s cache',
		flavor: ['Maps on maps, each one a little different from the last.'],
		model: null,
		color: 0x6a5a3a,
		size: [0.5, 0.35, 0.35],
		solid: false,
		slots: 4,
		open: [{ seconds: 0.5, verb: 'Open the satchel' }],
		noise: 2,
		lootNoise: 2,
		sound: 'lootable.cache',
		loot: [
			entry('chalk', [1, 3], [6, 6]),
			entry('candle', [1, 2], [3, 3]),
			entry('battery', [1, 1], [3, 3]),
			entry('recipe-fragment', [1, 1], [4, 4]),
			entry('compass', [1, 1], [1, 2])
		],
		rarity: everyLevel(
			counts({
				common: { count: [1, 2], chance: [0.3, 0.4] },
				uncommon: { count: [0, 1], chance: [0.2, 0.3] },
				rare: { count: [0, 1], chance: [0.05, 0.1] }
			})
		)
	},
	alcove: {
		id: 'alcove',
		name: 'Reliquary alcove',
		flavor: ['Behind the grille, a saint’s hand in silver. The air goes cold when you touch it.'],
		model: null,
		color: 0x8a8070,
		size: [0.8, 1.2, 0.4],
		solid: true,
		lookHeight: 0.9,
		slots: 2,
		open: [{ tool: 'pry', seconds: 6, verb: 'Pry open the alcove', noise: 6, every: 2 }],
		// Taking a saint's relic does not go unnoticed.
		meter: 0.04,
		noise: 6,
		lootNoise: 2,
		sound: 'lootable.alcove',
		// One legendary relic, and nothing else.
		loot: [
			entry('relic', [1, 1]),
			entry('crozier-head', [1, 1]),
			entry('sealed-reliquary-jar', [1, 1]),
			entry('ledger', [1, 1])
		],
		rarity: everyLevel(counts({})),
		prize: 1
	},
	font: {
		id: 'font',
		name: 'Font',
		flavor: ['The water is perfectly still, and colder than it should be.'],
		model: null,
		color: 0x8a8a84,
		size: [0.7, 1.0, 0.7],
		solid: true,
		slots: 0,
		// Nothing to open: it is filled from (`fill`).
		open: [],
		fill: {
			needs: 'glass-bottle',
			makes: 'holy-water',
			seconds: 2,
			fills: [2, 4],
			verb: 'Fill a bottle'
		},
		noise: 2,
		lootNoise: 0,
		sound: 'lootable.font',
		loot: [],
		rarity: everyLevel(counts({}))
	},
	// What an explorer drops that has no model of its own (docs/dev/lootables.md#drop-boxes).
	dropBox: {
		id: 'dropBox',
		name: 'Drop box',
		flavor: [
			'A battered iron box, left where someone put things down.',
			'Someone meant to come back for this.'
		],
		model: modelUrl('shared/props/drop_box.glb'),
		color: 0x3c3a36,
		size: [0.5, 0.38, 0.36],
		// Stepped over: it appears and goes in the middle of a game, and the map's collision doesn't.
		solid: false,
		slots: 8,
		open: [{ seconds: 0.5, verb: 'to open' }],
		noise: 0,
		lootNoise: 2,
		sound: 'crate.open',
		loot: [],
		rarity: everyLevel(counts({})),
		dropped: true
	}
};

/**
 * Items the loot tables name that aren't in the game yet: the materials, treasure and tools of the
 * gear, crafting and loot round (docs/handoff-gear-crafting-loot.md). Their table lines are skipped
 * until each is added to ITEMS (and taken out of here; a test checks every table line is one or
 * the other).
 */
export const PENDING_ITEMS = new Set<string>([]);

/**
 * How much treasure (by `value`) each level of a map holds at most, all its lootables together:
 * more lootables doesn't mean more treasure. What rolls past it is taken out again, at random.
 */
export const LOOT_BUDGET: number[] = [450, 650, 1500];
