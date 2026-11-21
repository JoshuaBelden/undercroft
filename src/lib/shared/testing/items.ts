import { ITEMS, type ItemDef } from '../../content/items.ts';

/**
 * Items for tests, for kinds of thing the game has no item of yet (gear, materials): put them in
 * `ITEMS` for a test file, and take them out again after. See docs/dev/testing.md.
 *
 *   beforeAll(() => addTestItems());
 *   afterAll(() => removeTestItems());
 */

/** An ordinary swing: what the combat test weapons build on. */
const MELEE = { damage: 20, range: 1.8, arc: 0.6, windup: 0.3, recovery: 0.4, noise: 4 };

const FIREARM: NonNullable<ItemDef['firearm']> = {
	damage: 30,
	pellets: 1,
	spread: { hip: 0, aimed: 0 },
	range: 40,
	falloff: 0,
	interval: 0.5,
	magazine: 6,
	reloadTime: 1,
	ammo: 'ammo.revolver',
	noise: 30,
	sound: 'revolver.fire',
	reloadSound: 'revolver.reload',
	recoil: { pitch: 0, yaw: 0 }
};

const THROW = {
	speed: 12,
	damage: 0,
	landNoise: 2,
	sound: 'brick.throw',
	land: 'brick.land'
} as const;

export const TEST_ITEMS: Record<string, ItemDef> = {
	'test.kneepads': {
		id: 'test.kneepads',
		name: 'Test kneepads',
		kind: 'gear',
		category: 'gear',
		flavor: 'Worn in a gear slot.',
		model: null,
		maxStack: 1,
		weight: 0.4,
		price: 40,
		durability: { max: 600, per: 'second' }
	},
	'test.rags': {
		id: 'test.rags',
		name: 'Test rags',
		kind: 'material',
		category: 'material',
		flavor: 'A material: backpack and stash only.',
		model: null,
		maxStack: 10,
		weight: 0.05,
		value: 1
	},
	// Combat (docs/dev/combat.md): one field each, on top of an ordinary weapon.
	'test.spade': weapon('test.spade', { melee: { ...MELEE, sweep: true, arc: 1.1, stamina: 12 } }),
	'test.club': weapon('test.club', {
		melee: { ...MELEE, bleed: { dps: 4, seconds: 5 }, snag: { chance: 1, seconds: 0.6 } }
	}),
	'test.spear': weapon('test.spear', { melee: MELEE, cramped: true }),
	'test.sledge': weapon('test.sledge', { melee: { ...MELEE, stamina: 20 }, noSprint: true }),
	'test.rifle': weapon('test.rifle', { firearm: { ...FIREARM, pierce: true } }),
	'test.derringer': weapon('test.derringer', { firearm: FIREARM, cramped: true, downed: true }),
	'test.crossbow': weapon('test.crossbow', {
		firearm: {
			...FIREARM,
			ammo: 'test.bolt',
			projectile: { speed: 40, landNoise: 2, breakChance: 0 }
		},
		silent: true
	}),
	'test.bolt': {
		id: 'test.bolt',
		name: 'Test bolt',
		kind: 'ammo',
		category: 'other',
		flavor: 'A round in flight.',
		model: null,
		maxStack: 12,
		weight: 0.05
	},
	'test.firecracker': quick('test.firecracker', {
		throwable: {
			...THROW,
			fuse: { seconds: 2, noise: 20, hiss: 'brick.throw', bang: 'brick.land' }
		}
	}),
	'test.oil': quick('test.oil', {
		throwable: { ...THROW, fire: { radius: 1.5, dps: 10, seconds: 3, sound: 'brick.land' } }
	}),
	'test.snare': quick('test.snare', {
		place: { seconds: 1, sound: 'brick.land', snare: { hold: 4, radius: 0.6 } }
	}),
	'test.salt': quick('test.salt', {
		place: { seconds: 0.5, sound: 'brick.land', ward: { length: 3, seconds: 30 } }
	}),
	// World (docs/dev/world.md): one field each.
	'test.gloves': {
		id: 'test.gloves',
		name: 'Test gloves',
		kind: 'gear',
		category: 'gear',
		flavor: 'Worn against bites and poison.',
		model: null,
		maxStack: 1,
		weight: 0.2,
		protects: ['bites', 'poison']
	},
	'test.jar': {
		id: 'test.jar',
		name: 'Test jar',
		kind: 'loot',
		category: 'other',
		flavor: 'Fragile.',
		model: null,
		maxStack: 1,
		weight: 0.5,
		fragile: true
	},
	'test.doll': {
		id: 'test.doll',
		name: 'Test doll',
		kind: 'loot',
		category: 'other',
		flavor: 'Cursed.',
		model: null,
		maxStack: 1,
		weight: 0.5,
		cursed: { sanity: 2 }
	},
	'test.pickaxe': weapon('test.pickaxe', { melee: MELEE, breaks: ['rubble'] }),
	'test.hatchet': weapon('test.hatchet', { melee: MELEE, cuts: ['web', 'cocoon'] }),
	'test.picks': quick('test.picks', { picks: true }),
	'test.piton': quick('test.piton', { place: { seconds: 0.5, sound: 'brick.land', anchor: true } })
};

function weapon(id: string, spec: Partial<ItemDef>): ItemDef {
	return {
		id,
		name: id,
		kind: spec.firearm ? 'firearm' : 'melee',
		category: 'weapon',
		flavor: 'A test weapon.',
		model: null,
		maxStack: 1,
		weight: 1,
		...spec
	};
}

function quick(id: string, spec: Partial<ItemDef>): ItemDef {
	return {
		id,
		name: id,
		kind: 'consumable',
		category: 'quick',
		flavor: 'A test item.',
		model: null,
		maxStack: 5,
		weight: 0.2,
		...spec
	};
}

export function addTestItems(): void {
	Object.assign(ITEMS, TEST_ITEMS);
}

export function removeTestItems(): void {
	for (const id of Object.keys(TEST_ITEMS)) delete ITEMS[id];
}
