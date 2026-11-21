import type { FirearmSpec, GripSpec, ItemDef, MeleeSpec } from '../items.ts';
import { modelUrl } from '../models.ts';

/**
 * The round's weapons (docs/handoff-gear-crafting-loot.md#melee-weapons and #ranged-weapons-and-ammo),
 * on the mechanics of docs/dev/combat.md. The knife, crowbar, brick, revolver and shotgun are in
 * items.ts. A weapon with no `price` in the store's list is found or crafted only: its price is what
 * it is worth (selling back 40% of it).
 */

const BLADE: GripSpec = {
	pose: 'oneHand',
	offset: [-0.0111, 0.07, -0.0279],
	rotation: [1.665, 0.232, 1.181]
};
const HAFT: GripSpec = {
	pose: 'oneHand',
	offset: [-0.0111, 0.07, -0.0279],
	rotation: [1.934, 0.73, 1.052]
};
const PISTOL: GripSpec = {
	pose: 'oneHand',
	offset: [-0.025, 0.07, -0.0223],
	rotation: [1.571, 0, 1.192]
};
const LONG_GUN: GripSpec = {
	pose: 'twoHand',
	offset: [-0.0111, 0.07, -0.0279],
	rotation: [1.571, 0, 1.192]
};
const SMALL: GripSpec = {
	pose: 'item',
	offset: [-0.0166, 0.075, -0.0418],
	rotation: [1.571, 0, 2.763]
};

function melee(
	id: string,
	name: string,
	flavor: string,
	spec: Partial<ItemDef> & { melee: MeleeSpec; weight: number; price: number; hits: number }
): ItemDef {
	const { hits, ...rest } = spec;
	return {
		id,
		name,
		kind: 'melee',
		category: 'weapon',
		flavor,
		model: null,
		grip: HAFT,
		maxStack: 1,
		durability: { max: hits, per: 'hit' },
		...rest
	};
}

function gun(
	id: string,
	name: string,
	flavor: string,
	spec: Partial<ItemDef> & { firearm: FirearmSpec; weight: number; price: number; shots: number }
): ItemDef {
	const { shots, ...rest } = spec;
	return {
		id,
		name,
		kind: 'firearm',
		category: 'weapon',
		flavor,
		model: null,
		placeholder: { size: [0.08, 0.12, 0.3], color: 0x3a3430 },
		muzzle: [0, 0.045, -0.21],
		grip: PISTOL,
		maxStack: 1,
		durability: { max: shots, per: 'shot' },
		...rest
	};
}

function ammo(
	id: string,
	name: string,
	flavor: string,
	spec: Partial<ItemDef> & { maxStack: number; weight: number; color: number }
): ItemDef {
	const { color, ...rest } = spec;
	return {
		id,
		name,
		kind: 'ammo',
		category: 'other',
		flavor,
		model: null,
		placeholder: { size: [0.06, 0.04, 0.04], color },
		...rest
	};
}

export const WEAPONS: Record<string, ItemDef> = {
	hatchet: melee(
		'hatchet',
		'Hatchet',
		'A woodsman’s hatchet, the edge kept keen. It parts webbing like cloth.',
		{
			model: modelUrl('shared/items/hatchet.glb'),
			grip: BLADE,
			weight: 0.9,
			price: 10,
			rarity: 'uncommon',
			hits: 120,
			melee: {
				damage: 28,
				range: 1.5,
				arc: 0.5,
				windup: 0.25,
				recovery: 0.4,
				noise: 4,
				stamina: 6,
				sound: { swing: 'hatchet.swing', hit: 'hatchet.hit' }
			},
			cuts: ['web', 'cocoon'],
			throwable: { speed: 15, damage: 35, landNoise: 5, sound: 'knife.throw', land: 'knife.land' }
		}
	),
	'trench-spade': melee(
		'trench-spade',
		'Trench spade',
		'Sharpened along the blade, the way they did it in the war. It takes everything in front of you.',
		{
			model: modelUrl('shared/items/trench_spade.glb'),
			weight: 1.8,
			price: 55,
			rarity: 'uncommon',
			hits: 160,
			melee: {
				damage: 22,
				range: 2.0,
				arc: 1.1,
				windup: 0.55,
				recovery: 0.8,
				noise: 6,
				stamina: 12,
				sweep: true,
				sound: { swing: 'spade.swing', hit: 'spade.hit' }
			}
		}
	),
	'short-spear': melee(
		'short-spear',
		'Short spear',
		'A blade lashed to a broom handle. Straight ahead, and nowhere else. It works where nothing else will.',
		{
			model: modelUrl('shared/items/short_spear.glb'),
			weight: 1.5,
			price: 5,
			rarity: 'uncommon',
			hits: 100,
			melee: {
				damage: 26,
				range: 2.4,
				arc: 0.15,
				windup: 0.3,
				recovery: 0.5,
				noise: 3,
				stamina: 7,
				sound: { swing: 'spear.thrust', hit: 'spear.hit' }
			},
			cramped: true
		}
	),
	'nail-club': melee(
		'nail-club',
		'Nail-studded club',
		'A table leg with nails driven through it. Crude, and what it opens keeps bleeding.',
		{
			model: modelUrl('shared/items/nail_club.glb'),
			weight: 1.2,
			price: 5,
			hits: 60,
			melee: {
				damage: 20,
				range: 1.6,
				arc: 0.6,
				windup: 0.35,
				recovery: 0.55,
				noise: 6,
				stamina: 8,
				bleed: { dps: 4, seconds: 5 },
				snag: { chance: 0.2, seconds: 0.6 },
				sound: { swing: 'club.swing', hit: 'club.hit' }
			}
		}
	),
	pickaxe: melee(
		'pickaxe',
		'Pickaxe',
		'A miner’s pick, the point worn bright. Slow, loud, and nothing in these walls stands up to it.',
		{
			model: modelUrl('shared/items/pickaxe.glb'),
			weight: 3.5,
			price: 90,
			rarity: 'rare',
			hits: 140,
			melee: {
				damage: 45,
				range: 1.8,
				arc: 0.4,
				windup: 0.6,
				recovery: 0.9,
				noise: 10,
				stamina: 14,
				sound: { swing: 'pickaxe.swing', hit: 'pickaxe.hit' }
			},
			breaks: ['rubble']
		}
	),
	sledgehammer: melee(
		'sledgehammer',
		'Sledgehammer',
		'Twelve pounds of iron on a hickory haft. It opens anything, and everything hears it.',
		{
			model: modelUrl('shared/items/sledgehammer.glb'),
			weight: 6,
			price: 110,
			rarity: 'rare',
			hits: 180,
			melee: {
				damage: 60,
				range: 1.9,
				arc: 0.7,
				windup: 0.9,
				recovery: 1.2,
				noise: 14,
				stamina: 20,
				stagger: 1.5,
				sound: { swing: 'sledge.swing', hit: 'sledge.hit' }
			},
			smash: true,
			noSprint: true
		}
	),
	// Three to a lot; each is lost or broken on its own.
	'throwing-knives': {
		id: 'throwing-knives',
		name: 'Throwing knives',
		kind: 'throwable',
		category: 'quick',
		flavor: 'Balanced blades with no handle to speak of. Throw them, then go and get them back.',
		model: modelUrl('shared/items/throwing_knives.glb'),
		grip: BLADE,
		maxStack: 6,
		weight: 0.15,
		price: 5,
		rarity: 'uncommon',
		throwable: { speed: 18, damage: 20, landNoise: 3, sound: 'knife.throw', land: 'knife.land' }
	},
	rifle: gun(
		'rifle',
		'Bolt-action rifle',
		'A soldier’s rifle, the stock scarred. One round goes through everything in its way.',
		{
			model: modelUrl('shared/items/rifle.glb'),
			muzzle: [0, 0.065, -0.77],
			grip: LONG_GUN,
			weight: 4,
			price: 320,
			rarity: 'epic',
			shots: 300,
			firearm: {
				damage: 70,
				pellets: 1,
				spread: { hip: 0.08, aimed: 0.002 },
				range: 60,
				falloff: 0.1,
				interval: 1.6,
				magazine: 5,
				reloadTime: 0.7,
				// One round at a time, each a reload of its own.
				single: true,
				ammo: 'ammo.rifle',
				noise: 45,
				sound: 'rifle.shot',
				reloadSound: 'rifle.load',
				recoil: { pitch: 0.12, yaw: 0.03 },
				pierce: true
			}
		}
	),
	derringer: gun(
		'derringer',
		'Derringer',
		'Two barrels you can hide in a palm. Useless past arm’s length, and it fires from the floor.',
		{
			model: modelUrl('shared/items/derringer.glb'),
			muzzle: [0, 0.04, -0.11],
			grip: PISTOL,
			category: 'quick',
			weight: 0.4,
			price: 90,
			rarity: 'rare',
			shots: 150,
			firearm: {
				damage: 28,
				pellets: 1,
				spread: { hip: 0.05, aimed: 0.03 },
				range: 10,
				falloff: 0.7,
				interval: 0.4,
				magazine: 2,
				reloadTime: 3,
				ammo: 'ammo.revolver',
				noise: 30,
				sound: 'derringer.shot',
				reloadSound: 'derringer.reload',
				recoil: { pitch: 0.05, yaw: 0.02 }
			},
			cramped: true,
			downed: true
		}
	),
	crossbow: gun(
		'crossbow',
		'Crossbow',
		'Built from a cart spring and a coffin lid. It makes no sound at all, and the bolt takes its time.',
		{
			model: modelUrl('shared/items/crossbow.glb'),
			grip: LONG_GUN,
			weight: 3,
			price: 50,
			rarity: 'rare',
			shots: 120,
			firearm: {
				damage: 55,
				pellets: 1,
				spread: { hip: 0.04, aimed: 0.004 },
				range: 35,
				falloff: 0,
				interval: 0.3,
				magazine: 1,
				reloadTime: 2.5,
				ammo: 'bolts',
				noise: 0,
				sound: 'crossbow.shot',
				reloadSound: 'crossbow.crank',
				recoil: { pitch: 0.02, yaw: 0.01 },
				projectile: { speed: 45, landNoise: 2, breakChance: 0.3 },
				// Cranking it back is slow work: a crawl while it is done.
				reloadSlow: true
			},
			silent: true
		}
	),
	slingshot: gun(
		'slingshot',
		'Slingshot',
		'A forked stick and a strip of rubber. It won’t kill anything. It makes a noise a long way off.',
		{
			model: modelUrl('shared/items/slingshot.glb'),
			grip: SMALL,
			weight: 0.2,
			price: 5,
			shots: 80,
			firearm: {
				damage: 6,
				pellets: 1,
				spread: { hip: 0.06, aimed: 0.03 },
				range: 25,
				falloff: 0.5,
				interval: 0.6,
				magazine: 1,
				reloadTime: 1,
				ammo: 'pebbles',
				// Old coins fly as well as pebbles.
				alsoFires: ['coins'],
				noise: 0,
				sound: 'slingshot.shot',
				reloadSound: 'revolver.reload',
				recoil: { pitch: 0.01, yaw: 0 },
				projectile: { speed: 28, landNoise: 8 }
			},
			silent: true
		}
	),
	'oil-bottle': {
		id: 'oil-bottle',
		name: 'Oil bottle',
		kind: 'throwable',
		category: 'quick',
		flavor: 'Lamp oil in a bottle, a rag in the neck. Light it, throw it, stand well back.',
		model: modelUrl('shared/items/oil_bottle.glb'),
		grip: SMALL,
		maxStack: 3,
		weight: 0.6,
		price: 5,
		rarity: 'uncommon',
		throwable: {
			speed: 12,
			damage: 0,
			landNoise: 6,
			sound: 'brick.throw',
			land: 'oilbottle.shatter',
			fire: { radius: 1.6, dps: 15, seconds: 5, sound: 'item.break' }
		}
	},
	'ammo.rifle': ammo('ammo.rifle', 'Rifle rounds', 'Long brass rounds on a stripper clip.', {
		maxStack: 20,
		weight: 0.025,
		price: 5,
		rarity: 'rare',
		color: 0xb08a3a
	}),
	bolts: ammo('bolts', 'Crossbow bolts', 'Short iron-tipped bolts. Go and get them back.', {
		maxStack: 12,
		weight: 0.05,
		price: 1,
		rarity: 'uncommon',
		color: 0x6b4c2e
	})
};
