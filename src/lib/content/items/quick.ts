import type { GripSpec, ItemDef } from '../items.ts';
import { modelUrl } from '../models.ts';

/**
 * Quick-use items (docs/handoff-gear-crafting-loot.md#quick-use-and-backpack): taken in the hand
 * from a quick-use slot and used with attack. The bandage, medkit, salts, battery, chalk and rope
 * are in items.ts.
 */

const SMALL: GripSpec = {
	pose: 'item',
	offset: [-0.0166, 0.075, -0.0418],
	rotation: [1.571, 0, 2.763]
};

function quick(
	id: string,
	name: string,
	flavor: string,
	spec: Partial<ItemDef> & { weight: number; maxStack: number; color: number }
): ItemDef {
	const { color, ...rest } = spec;
	return {
		id,
		name,
		kind: 'consumable',
		category: 'quick',
		flavor,
		model: null,
		placeholder: { size: [0.08, 0.06, 0.06], color },
		grip: SMALL,
		...rest
	};
}

export const QUICK: Record<string, ItemDef> = {
	laudanum: quick(
		'laudanum',
		'Laudanum',
		'Tincture of opium in a brown bottle. The dark stops mattering for a while. So does aiming.',
		{
			model: modelUrl('shared/items/laudanum.glb'),
			weight: 0.15,
			maxStack: 3,
			price: 45,
			rarity: 'rare',
			color: 0x5a3018,
			dose: { condition: 'laudanum', seconds: 1.5, sound: 'laudanum.drink' }
		}
	),
	// Thrown, a light that fades: in the light budget, and moths come to it.
	'glow-sticks': quick(
		'glow-sticks',
		'Glow sticks',
		'Snap one and shake it, and it glows a sick green for a few minutes. Throw it where you need to see.',
		{
			model: modelUrl('shared/items/glow_sticks.glb'),
			kind: 'throwable',
			weight: 0.05,
			maxStack: 6,
			price: 5,
			color: 0x6aff6a,
			throwable: {
				speed: 13,
				damage: 0,
				landNoise: 2,
				sound: 'glowstick.crack',
				land: 'knife.land',
				glow: { seconds: 180, range: 7, color: 0x7dff8a }
			}
		}
	),
	pitons: quick('pitons', 'Climbing pitons', 'Iron spikes with an eye for the rope.', {
		model: modelUrl('shared/items/piton.glb'),
		weight: 0.2,
		maxStack: 6,
		price: 7,
		rarity: 'uncommon',
		color: 0x55595c,
		place: { seconds: 2, sound: 'piton.hammer', anchor: true }
	}),
	// Held in the hand: quiet on trunks, offering boxes and gates, and a pick may snap.
	lockpicks: quick(
		'lockpicks',
		'Lockpicks',
		'A tension wrench and a ring of picks in a cloth roll. Quiet, if you have the patience.',
		{
			model: modelUrl('shared/items/lockpicks.glb'),
			weight: 0.05,
			maxStack: 5,
			price: 30,
			rarity: 'uncommon',
			color: 0x404448,
			picks: true
		}
	),
	snare: quick('snare', 'Snare', 'A noose of wire on a stake. The first thing through it stays.', {
		model: modelUrl('shared/items/snare.glb'),
		weight: 0.3,
		maxStack: 3,
		price: 5,
		color: 0x55595c,
		place: { seconds: 1.5, sound: 'snare.spring', snare: { hold: 4, radius: 0.6 } }
	}),
	'tripwire-bell': quick(
		'tripwire-bell',
		'Tripwire bell',
		'A bell on a line across the way. When it rings, something has come through.',
		{
			model: modelUrl('shared/items/tripwire_bell.glb'),
			weight: 0.2,
			maxStack: 1,
			price: 3,
			color: 0xb08a3a,
			durability: { max: 3, per: 'use' },
			place: {
				seconds: 1.5,
				sound: 'tripwire.ring',
				tripwire: { length: 2.5, noise: 12 }
			}
		}
	),
	'blessed-salt': quick(
		'blessed-salt',
		'Blessed salt',
		'Rock salt soaked in holy water. Pour a line, and what hunts you won’t cross it. For a while.',
		{
			model: modelUrl('shared/items/salt_bag.glb'),
			weight: 0.3,
			maxStack: 3,
			price: 10,
			rarity: 'uncommon',
			color: 0xe0dcd4,
			place: { seconds: 1, sound: 'salt.pour', ward: { length: 3, seconds: 30 } }
		}
	),
	// Made below only, from a recipe a quest teaches (docs/dev/quests.md#the-barred-stair).
	'quarrymans-charge': quick(
		'quarrymans-charge',
		"Quarryman's charge",
		'Powder, firecrackers and oil, bound tight in twine. Set it against something and run.',
		{
			model: modelUrl('shared/items/quarrymans_charge.glb'),
			weight: 1.2,
			maxStack: 1,
			value: 40,
			color: 0x7a3a22,
			place: {
				seconds: 2,
				sound: 'charge.fuse',
				blast: { fuse: 8, radius: 4, noise: 80 }
			}
		}
	),
	firecrackers: quick(
		'firecrackers',
		'Firecrackers',
		'A string of red crackers and a slow fuse. Throw it, then be somewhere else.',
		{
			model: modelUrl('shared/items/firecrackers.glb'),
			kind: 'throwable',
			weight: 0.1,
			maxStack: 5,
			price: 20,
			color: 0xa02020,
			throwable: {
				speed: 13,
				damage: 0,
				landNoise: 2,
				sound: 'brick.throw',
				land: 'knife.land',
				fuse: { seconds: 4, noise: 20, hiss: 'firecrackers.fuse', bang: 'firecrackers.bang' }
			}
		}
	),
	// Rats go to it, not you. It doesn't keep: gone once you are back up.
	bait: quick('bait', 'Bait', 'Something dead in a twist of paper. Rats can’t leave it alone.', {
		model: modelUrl('shared/items/bait.glb'),
		kind: 'throwable',
		weight: 0.2,
		maxStack: 3,
		price: 8,
		value: 0,
		color: 0x5a4030,
		spoils: true,
		throwable: {
			speed: 12,
			damage: 0,
			landNoise: 2,
			sound: 'brick.throw',
			land: 'knife.land',
			lure: { creature: 'rat', radius: 12, seconds: 20 }
		}
	}),
	'grave-dirt': quick(
		'grave-dirt',
		'Grave dirt',
		'A pinch of earth from a crypt floor. Rub it on, and what follows you loses the scent.',
		{
			model: modelUrl('shared/items/grave_dirt.glb'),
			weight: 0.3,
			maxStack: 3,
			price: 25,
			rarity: 'rare',
			color: 0x3a3028,
			dose: { condition: 'buried', seconds: 1, sound: 'inventory.rummage' }
		}
	),
	// Held, it keeps the small things off, and fills the noise meter slowly. Lamp oil refills it.
	censer: quick(
		'censer',
		'Incense censer',
		'A brass censer on a chain, smoking sweetly. Moths, rats and spiders keep their distance.',
		{
			model: modelUrl('shared/items/censer.glb'),
			weight: 1.5,
			maxStack: 1,
			price: 70,
			rarity: 'rare',
			color: 0xb08a3a,
			// Three minutes of smoke while held.
			durability: { max: 180, per: 'second' },
			censer: { radius: 6, repels: ['moth', 'rat', 'spider'], noise: 4 }
		}
	),
	whistle: quick(
		'whistle',
		'Whistle',
		'A brass police whistle. Your friends will know where you are. So will everything else.',
		{
			model: modelUrl('shared/items/whistle.glb'),
			weight: 0.05,
			maxStack: 1,
			price: 10,
			color: 0xb08a3a,
			whistle: { noise: 25, seconds: 10 }
		}
	)
};
