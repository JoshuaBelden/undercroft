import type { ItemDef } from '../items.ts';
import { modelUrl } from '../models.ts';

/**
 * Defense and gear (docs/handoff-gear-crafting-loot.md#defensive-and-gear). Gear is worn in one of
 * the three gear slots and works while it is there (`workingGear`), wearing by the second or by the
 * use. The padded coat is in items.ts.
 */

function gear(
	id: string,
	name: string,
	flavor: string,
	spec: Partial<ItemDef> & { price: number; weight: number; color: number }
): ItemDef {
	const { color, ...rest } = spec;
	return {
		id,
		name,
		kind: 'gear',
		category: 'gear',
		flavor,
		model: null,
		placeholder: { size: [0.2, 0.08, 0.16], color },
		maxStack: 1,
		rarity: 'uncommon',
		...rest
	};
}

export const GEAR: Record<string, ItemDef> = {
	jerkin: {
		id: 'jerkin',
		name: 'Leather jerkin',
		kind: 'defense',
		category: 'defense',
		flavor: 'Boiled leather, thick as a boot sole. It takes a beating, and it slows you down.',
		model: null,
		placeholder: { size: [0.4, 0.12, 0.5], color: 0x4a3020 },
		maxStack: 1,
		weight: 3.5,
		price: 160,
		rarity: 'rare',
		durability: { max: 70, per: 'point' },
		defense: { shield: 70 },
		// About 5% slower at a sprint.
		sprint: 0.95
	},
	// Lets you craft below (Workshop, crafting: docs/handoff-gear-crafting-loot.md#crafting).
	'crafting-kit': gear(
		'crafting-kit',
		'Field crafting kit',
		'A leather roll of awls, pliers and needles. Enough to make do, down there.',
		{ price: 35, weight: 1.2, color: 0x5c3a24, durability: { max: 20, per: 'use' }, crafting: true }
	),
	kneepads: gear(
		'kneepads',
		'Kneepads',
		'Leather pads stuffed with horsehair. Crawling stops being agony, and gets quieter.',
		{
			price: 40,
			weight: 0.4,
			color: 0x4a3020,
			// Ten minutes of crawling.
			durability: { max: 600, per: 'second' },
			crawl: { speed: 1.25, quiet: 0.5 }
		}
	),
	overshoes: gear(
		'overshoes',
		'Felt overshoes',
		'Thick felt pulled over the boots. Your steps go soft on the stone.',
		{
			price: 35,
			weight: 0.4,
			color: 0x6a645c,
			// Half an hour of walking.
			durability: { max: 1800, per: 'second' },
			steps: { quiet: 0.6 }
		}
	),
	gloves: gear(
		'gloves',
		'Gloves',
		'Heavy leather gauntlets. Teeth and stings don’t get through, and rope doesn’t burn.',
		{
			price: 30,
			weight: 0.4,
			color: 0x3a2818,
			// Forty searches of nests and cocoons.
			durability: { max: 40, per: 'use' },
			protects: ['bites', 'poison'],
			climb: 1.15
		}
	),
	compass: gear(
		'compass',
		'Pocket compass',
		'Brass, with a lid that clicks. The needle doesn’t point north down here. It points out.',
		{
			model: modelUrl('shared/items/pocket_compass.glb'),
			price: 55,
			weight: 0.15,
			rarity: 'rare',
			color: 0xb08a3a,
			compass: true
		}
	)
};
