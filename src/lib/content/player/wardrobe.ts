/**
 * The explorer's wardrobe: the bodies, their faces, and the hair and clothes a player dresses
 * them in, with the colours each can be tinted. Built in Blender by scripts/blender/wardrobe.py
 * (MakeHuman assets, CC0); every body has every piece, fitted to it. See docs/dev/player.md#the-look.
 */

/** The bodies. A face is a shape key on the body (`face-<n>`, n from 1); face 0 is the body's own. */
export const BODIES = {
	male: { label: 'Masculine', faces: 5 },
	female: { label: 'Feminine', faces: 5 }
} as const satisfies Record<string, { label: string; faces: number }>;

export type BodyId = keyof typeof BODIES;

/** Where a piece is worn; one piece per slot. */
export const WEAR_SLOTS = ['hair', 'shirt', 'pants', 'jacket'] as const;
export type WearSlot = (typeof WEAR_SLOTS)[number];

/** Slots that may be left empty (no jacket). Hair, a shirt and pants are always worn. */
export const OPTIONAL_SLOTS: ReadonlySet<WearSlot> = new Set(['jacket']);

export interface WearDef {
	label: string;
	slot: WearSlot;
	/**
	 * Its bit in the body's `_HIDE` vertex attribute: the body under it is not drawn while it is
	 * worn. Set by `HIDE_BITS` in scripts/blender/wardrobe.py; the two must agree.
	 */
	hideBit: number;
	/** Other pieces it covers whole: not drawn while it is worn (the shirt under the sweater). */
	covers?: readonly string[];
}

/** Every piece: its id is its file, `shared/player/<body>/<id>.glb`. */
export const WEAR = {
	'hair-short': { label: 'Short', slot: 'hair', hideBit: 1 },
	'hair-bob': { label: 'Bob', slot: 'hair', hideBit: 2 },
	'hair-ponytail': { label: 'Ponytail', slot: 'hair', hideBit: 3 },
	'hair-long': { label: 'Long', slot: 'hair', hideBit: 4 },
	'hair-afro': { label: 'Afro', slot: 'hair', hideBit: 5 },
	shirt: { label: 'Polo shirt', slot: 'shirt', hideBit: 6 },
	'pants-cargo': { label: 'Cargo pants', slot: 'pants', hideBit: 7 },
	'pants-wool': { label: 'Wool trousers', slot: 'pants', hideBit: 8 },
	// No CC0 jacket exists in the MakeHuman packs yet: the sweater is the outer layer.
	'jacket-sweater': { label: 'Wool sweater', slot: 'jacket', hideBit: 9, covers: ['shirt'] }
} as const satisfies Record<string, WearDef>;

export type WearId = keyof typeof WEAR;

/** The boots, always worn (part of the body file): their `_HIDE` bit. */
export const BOOTS_HIDE_BIT = 0;

/** What can be tinted: the skin, and what is worn in each slot. */
export const TINT_PARTS = ['skin', ...WEAR_SLOTS] as const;
export type TintPart = (typeof TINT_PARTS)[number];

export interface Swatch {
	id: string;
	label: string;
	/** The colour, as a CSS hex; null leaves the texture's own colour. */
	color: string | null;
}

const CLOTH: Swatch[] = [
	{ id: 'own', label: 'As made', color: null },
	{ id: 'charcoal', label: 'Charcoal', color: '#3a3a3c' },
	{ id: 'bone', label: 'Bone', color: '#d8cfbd' },
	{ id: 'oxblood', label: 'Oxblood', color: '#6e1f22' },
	{ id: 'moss', label: 'Moss', color: '#4f5a35' },
	{ id: 'ochre', label: 'Ochre', color: '#a87a2c' },
	{ id: 'slate', label: 'Slate', color: '#4b5a6b' },
	{ id: 'umber', label: 'Umber', color: '#5a3e2b' }
];

/** The colours each part can take; the first is its default. */
export const TINTS: Record<TintPart, Swatch[]> = {
	skin: [
		{ id: 'fair', label: 'Fair', color: '#e8c3a8' },
		{ id: 'light', label: 'Light', color: '#d6a587' },
		{ id: 'tan', label: 'Tan', color: '#b98262' },
		{ id: 'olive', label: 'Olive', color: '#a07650' },
		{ id: 'brown', label: 'Brown', color: '#7d5139' },
		{ id: 'deep', label: 'Deep', color: '#4e3022' }
	],
	hair: [
		{ id: 'own', label: 'As made', color: null },
		{ id: 'black', label: 'Black', color: '#1b1716' },
		{ id: 'dark-brown', label: 'Dark brown', color: '#3b2619' },
		{ id: 'brown', label: 'Brown', color: '#6a4529' },
		{ id: 'auburn', label: 'Auburn', color: '#7c3519' },
		{ id: 'blond', label: 'Blond', color: '#b89660' },
		{ id: 'grey', label: 'Grey', color: '#8d8a86' }
	],
	shirt: CLOTH,
	pants: CLOTH,
	jacket: CLOTH
};
