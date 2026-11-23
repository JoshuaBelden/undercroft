import type { ItemDef, Rarity } from '../items.ts';

/**
 * The round's new treasure (docs/handoff-gear-crafting-loot.md#treasure): sold for its `value`,
 * never salvaged. Today's treasure (coins, the bone rosary, the gold tooth, the signet ring, the
 * candlestick, the chalice and the reliquary) is in items.ts. A few have a use besides.
 */

function treasure(
	id: string,
	name: string,
	flavor: string,
	spec: Partial<ItemDef> & {
		value: number;
		rarity: Rarity;
		weight: number;
		maxStack: number;
		color: number;
		size?: [number, number, number];
	}
): ItemDef {
	const { color, size, ...rest } = spec;
	return {
		id,
		name,
		kind: 'loot',
		category: 'other',
		treasure: true,
		flavor,
		model: null,
		placeholder: { size: size ?? [0.08, 0.06, 0.08], color },
		...rest
	};
}

export const TREASURE: Record<string, ItemDef> = {
	'silver-snuffbox': treasure(
		'silver-snuffbox',
		'Silver snuffbox',
		'Engraved with someone’s initials. A pinch of brown dust still inside.',
		{ value: 55, rarity: 'uncommon', weight: 0.1, maxStack: 3, color: 0x8c9094 }
	),
	'jet-rosary': treasure(
		'jet-rosary',
		'Jet rosary',
		'Black beads polished by a lifetime of worried fingers.',
		{ value: 60, rarity: 'uncommon', weight: 0.08, maxStack: 3, color: 0x1a1a1e }
	),
	'cameo-brooch': treasure(
		'cameo-brooch',
		'Cameo brooch',
		'A woman’s profile in pale shell. She was somebody’s mother.',
		{ value: 120, rarity: 'rare', weight: 0.04, maxStack: 3, color: 0xe0c8b0 }
	),
	// Its shrine use waits for shrines: until then, treasure only.
	'funeral-coin': treasure(
		'funeral-coin',
		'Funeral coin',
		'A silver obol, the fare for the ferryman. Someone never paid it.',
		{ value: 120, rarity: 'rare', weight: 0.02, maxStack: 5, color: 0xa8acb0 }
	),
	'apothecary-jar': treasure(
		'apothecary-jar',
		'Apothecary jar',
		'Painted porcelain, the label in Latin. Fall hard and it will not survive.',
		{
			value: 130,
			rarity: 'rare',
			weight: 0.8,
			maxStack: 1,
			color: 0xd8d0c0,
			size: [0.12, 0.2, 0.12],
			fragile: true
		}
	),
	medal: treasure(
		'medal',
		'Military medal',
		'Bronze on a faded ribbon. For valour, it says, in a war no one remembers.',
		{ value: 140, rarity: 'rare', weight: 0.05, maxStack: 3, color: 0x8a6a2a }
	),
	// Drawn at the start of a run: a small blessing or curse (docs/dev/items.md#tarot).
	tarot: treasure(
		'tarot',
		'Tarot deck',
		'Hand-painted cards in a cedar box. Draw one before you go down, if you dare.',
		{ value: 150, rarity: 'rare', weight: 0.2, maxStack: 1, color: 0x6a3a5a, tarot: true }
	),
	garnet: treasure('garnet', 'Uncut garnet', 'A dark red stone the size of a knuckle.', {
		value: 160,
		rarity: 'rare',
		weight: 0.05,
		maxStack: 3,
		color: 0x7a1a2a
	}),
	// Counts as all five rite candles.
	'black-candle': treasure(
		'black-candle',
		'Black candle',
		'Thick, black and unlit, and older than the chapel.',
		{
			value: 280,
			rarity: 'epic',
			weight: 0.3,
			maxStack: 1,
			color: 0x141414,
			size: [0.05, 0.25, 0.05],
			countsAs: { item: 'candle', count: 5 }
		}
	),
	// Opens any one trunk, and is used up.
	'key-ring': treasure(
		'key-ring',
		'Custodian’s key ring',
		'Twenty keys on an iron ring. One of them opens anything down here, once.',
		{ value: 300, rarity: 'epic', weight: 0.4, maxStack: 1, color: 0x55595c, unlocks: true }
	),
	'saints-icon': treasure(
		'saints-icon',
		'Painted saint’s icon',
		'Gold leaf and egg tempera. The saint’s eyes have been scratched out.',
		{
			value: 320,
			rarity: 'epic',
			weight: 0.6,
			maxStack: 1,
			color: 0xc2a64e,
			size: [0.2, 0.25, 0.03]
		}
	),
	ledger: treasure(
		'ledger',
		'Ossuary keeper’s ledger',
		'Every name that came down here, in a careful hand. The last pages are not in his.',
		{
			value: 360,
			rarity: 'epic',
			weight: 0.8,
			maxStack: 1,
			color: 0x4a3020,
			size: [0.2, 0.05, 0.28]
		}
	),
	astrolabe: treasure(
		'astrolabe',
		'Brass astrolabe',
		'For reading the stars, from somewhere the stars can’t be seen.',
		{
			value: 420,
			rarity: 'epic',
			weight: 1,
			maxStack: 1,
			color: 0xb08a3a,
			size: [0.18, 0.18, 0.04]
		}
	),
	// Cursed: phantom sounds, and sanity lost while carried.
	doll: treasure(
		'doll',
		'Porcelain doll',
		'Glass eyes, a lace dress gone grey. You keep catching it looking at you.',
		{
			value: 450,
			rarity: 'epic',
			weight: 0.5,
			maxStack: 1,
			color: 0xe8e0d8,
			size: [0.1, 0.3, 0.08],
			cursed: { sanity: 0.5 }
		}
	),
	'crozier-head': treasure(
		'crozier-head',
		'Bishop’s crozier head',
		'The crook of a bishop’s staff, solid silver, set with stones. It weighs like a sin.',
		{
			value: 900,
			rarity: 'legendary',
			weight: 4,
			maxStack: 1,
			color: 0xa8acb0,
			size: [0.2, 0.35, 0.06]
		}
	),
	'sealed-reliquary-jar': treasure(
		'sealed-reliquary-jar',
		'Sealed reliquary jar',
		'Crystal and gold, sealed with wax and a bishop’s ring. Something moves inside. Don’t drop it.',
		{
			value: 1000,
			rarity: 'legendary',
			weight: 1.5,
			maxStack: 1,
			color: 0xd9b84a,
			size: [0.14, 0.24, 0.14],
			fragile: true
		}
	)
};
