import type { ItemDef } from '../items.ts';

/**
 * Materials (docs/handoff-gear-crafting-loot.md#materials): found below, used in recipes and
 * repairs, sold for little. Backpack and stash only, never a quick-use slot. They sell at their
 * `value`, like treasure, but aren't treasure. Recipes come with the Workshop.
 */

function material(
	id: string,
	name: string,
	flavor: string,
	spec: {
		value: number;
		weight: number;
		maxStack: number;
		image?: string;
		rarity?: ItemDef['rarity'];
		color: number;
		size?: [number, number, number];
		price?: number;
	}
): ItemDef {
	return {
		id,
		name,
		kind: 'material',
		category: 'material',
		flavor,
		...(spec.image ? { image: spec.image } : {}),
		model: null,
		placeholder: { size: spec.size ?? [0.12, 0.06, 0.1], color: spec.color },
		maxStack: spec.maxStack,
		weight: spec.weight,
		value: spec.value,
		...(spec.price !== undefined ? { price: spec.price } : {}),
		...(spec.rarity ? { rarity: spec.rarity } : {})
	};
}

export const MATERIALS: Record<string, ItemDef> = {
	rags: material('rags', 'Rags', 'Strips of old shirt and shroud. Clean enough to bind with.', {
		value: 1,
		weight: 0.05,
		maxStack: 10,
		image: 'rags',
		color: 0x8a7f6a
	}),
	twine: material('twine', 'Twine', 'A hank of tarred twine. It holds a knot.', {
		value: 1,
		weight: 0.05,
		maxStack: 10,
		image: 'twine',
		color: 0x7a6440
	}),
	wax: material('wax', 'Wax scraps', 'Drippings scraped from a hundred candles.', {
		value: 1,
		weight: 0.05,
		maxStack: 10,
		image: 'wax_scraps',
		color: 0xd8cba0
	}),
	// Found ten to a lot; a recipe counts single nails.
	nails: material('nails', 'Nails', 'Square iron nails, rusted but straight.', {
		value: 0.1,
		weight: 0.005,
		maxStack: 40,
		image: 'nails',
		color: 0x5a5550,
		size: [0.06, 0.02, 0.06]
	}),
	wood: material('wood', 'Wood', 'Seasoned boards from a broken coffin. Still sound.', {
		value: 1,
		weight: 0.4,
		maxStack: 5,
		image: 'wood',
		color: 0x6b4c2e,
		size: [0.5, 0.05, 0.12]
	}),
	metal: material('metal', 'Metal scraps', 'Bent iron, a hinge, a length of strap.', {
		value: 2,
		weight: 0.3,
		maxStack: 10,
		image: 'metal_scraps',
		color: 0x55595c
	}),
	leather: material('leather', 'Leather scraps', 'Cut from a boot, a belt, a strap. Supple yet.', {
		value: 2,
		weight: 0.1,
		maxStack: 10,
		image: 'leather_scraps',
		color: 0x5c3a24
	}),
	rubber: material(
		'rubber',
		'Rubber',
		'A length of perished hose, still with some stretch in it.',
		{
			value: 2,
			weight: 0.1,
			maxStack: 10,
			image: 'rubber',
			rarity: 'uncommon',
			color: 0x2a2826
		}
	),
	'rope-length': material(
		'rope-length',
		'Rope length',
		'Five metres of good rope, cut from more.',
		{
			value: 2,
			weight: 0.2,
			maxStack: 8,
			image: 'rope_length',
			color: 0x8c7650
		}
	),
	'glass-bottle': material(
		'glass-bottle',
		'Glass bottle',
		'Green glass with a cork. Empty, which down here is something.',
		{
			value: 1,
			weight: 0.3,
			maxStack: 3,
			image: 'glass_bottle',
			color: 0x3d5a3a,
			size: [0.07, 0.24, 0.07]
		}
	),
	'lamp-oil': material('lamp-oil', 'Lamp oil', 'A stoppered tin of paraffin. It sloshes.', {
		value: 3,
		weight: 0.4,
		maxStack: 3,
		rarity: 'uncommon',
		color: 0x8a6a2a,
		size: [0.1, 0.16, 0.06]
	}),
	'rock-salt': material(
		'rock-salt',
		'Rock salt',
		'Grey crystals in a paper twist. The old ones swore by it.',
		{ value: 2, weight: 0.2, maxStack: 5, rarity: 'uncommon', color: 0xc8c4bc }
	),
	'holy-water': material(
		'holy-water',
		'Holy water',
		'Water from a font, in a bottle. It stays colder than it should.',
		{
			value: 4,
			weight: 0.4,
			maxStack: 3,
			rarity: 'uncommon',
			color: 0x9ab4c8,
			size: [0.07, 0.24, 0.07]
		}
	),
	bone: material('bone', 'Bone', 'A long bone, clean and dry. Nobody will miss it now.', {
		value: 0,
		weight: 0.2,
		maxStack: 10,
		color: 0xd8d0bc,
		size: [0.3, 0.04, 0.04]
	}),
	// The one material the store sells (Trusted).
	'gun-oil': material('gun-oil', 'Gun oil', 'A small can of fine oil. Guns last longer for it.', {
		value: 4,
		weight: 0.1,
		maxStack: 5,
		rarity: 'uncommon',
		color: 0x3a3020,
		size: [0.06, 0.1, 0.04],
		price: 12
	}),
	'gun-parts': material(
		'gun-parts',
		'Gun parts',
		'A spring, a pin, a hammer. Someone took a gun apart down here.',
		{ value: 10, weight: 0.3, maxStack: 5, rarity: 'rare', color: 0x404448 }
	),
	// Slingshot shot, found by rubble. Never discovered, so no recipe uses it.
	pebbles: {
		id: 'pebbles',
		name: 'Pebbles',
		kind: 'ammo',
		category: 'other',
		flavor: 'Round stones, the size of a thumb. Good for a slingshot.',
		model: null,
		placeholder: { size: [0.05, 0.04, 0.05], color: 0x6a645c },
		maxStack: 20,
		weight: 0.02,
		value: 0
	}
};
