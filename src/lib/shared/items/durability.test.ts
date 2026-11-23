import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHOP, sellPrice } from '../../content/economy.ts';
import { ITEMS } from '../../content/items.ts';
import { addTestItems, removeTestItems } from '../testing/items.ts';
import {
	addWear,
	condition,
	isBroken,
	lasting,
	mend,
	wearAmount,
	works,
	wreck
} from './durability.ts';
import {
	absorbBlow,
	emptyInventory,
	heldWorking,
	newStack,
	shieldOf,
	wearHeld,
	workingGear
} from './inventory.ts';

beforeAll(() => addTestItems());
afterAll(() => removeTestItems());

describe('the item data', () => {
	it('every item that wears is one to a slot, so no two stacks of wear merge', () => {
		for (const def of Object.values(ITEMS)) {
			if (def.durability) expect(def.maxStack, def.id).toBe(1);
		}
	});

	it('defense wears by the points it takes: its durability is its shield', () => {
		for (const def of Object.values(ITEMS)) {
			if (!def.defense) continue;
			expect(def.durability, def.id).toEqual({ max: def.defense.shield, per: 'point' });
		}
	});

	it('the store sells everything at its own price, in lots', () => {
		for (const entry of SHOP) {
			const def = ITEMS[entry.item];
			expect(def?.price, entry.item).toBeGreaterThan(0);
			expect(entry.price).toBe(def.price! * entry.lot);
		}
		// What the store charged before every item had a price.
		const prices = Object.fromEntries(SHOP.map((e) => [e.item, e.price]));
		expect(prices).toMatchObject({ revolver: 150, 'ammo.revolver': 12, 'ammo.shotgun': 16 });
	});
});

describe('wear', () => {
	it('a gun wears a shot at a time, and breaks at the last', () => {
		const gun = newStack('revolver');
		const max = ITEMS.revolver.durability!.max;
		expect(condition(gun)).toBe(1);
		expect(addWear(gun, max - 1)).toBe('ok');
		expect(isBroken(gun)).toBe(false);
		expect(works(gun)).toBe(true);
		expect(addWear(gun)).toBe('broke');
		expect(isBroken(gun)).toBe(true);
		expect(works(gun)).toBe(false);
		expect(condition(gun)).toBe(0);
		// Broken already: more wear changes nothing.
		expect(addWear(gun, 5)).toBe('ok');
		expect(gun.worn).toBe(max);
	});

	it('a brick is used up rather than broken', () => {
		const brick = newStack('brick');
		expect(lasting(ITEMS.brick)).toMatchObject({ max: 3, usedUp: true });
		expect(addWear(brick)).toBe('ok');
		expect(addWear(brick)).toBe('ok');
		expect(addWear(brick)).toBe('usedUp');
		// Used up isn't broken: it is gone, not kept.
		expect(isBroken(brick)).toBe(false);
	});

	it('things with no durability never wear', () => {
		const bandage = newStack('bandage');
		expect(lasting(ITEMS.bandage)).toBeNull();
		expect(condition(bandage)).toBeNull();
		expect(addWear(bandage, 100)).toBe('ok');
		expect(isBroken(bandage)).toBe(false);
	});

	it('mending makes it new, wrecking breaks it', () => {
		const knife = newStack('knife');
		wreck(knife);
		expect(isBroken(knife)).toBe(true);
		mend(knife);
		expect(isBroken(knife)).toBe(false);
		expect(condition(knife)).toBe(1);
	});

	it('wear in the hand: a broken knife stays there, a used-up brick leaves it', () => {
		const inv = emptyInventory();
		inv.equipment.primary = newStack('knife');
		inv.equipment.primary.worn = ITEMS.knife.durability!.max - 1;
		expect(wearHeld(inv, 'knife')).toBe('broke');
		expect(inv.equipment.primary?.item).toBe('knife');
		// Not what is in the hand: nothing happens.
		expect(wearHeld(inv, 'crowbar')).toBeNull();

		inv.quick[0] = newStack('brick');
		inv.selected = 2;
		inv.quick[0].uses = 2;
		expect(wearHeld(inv, 'brick')).toBe('usedUp');
		expect(inv.quick[0]).toBeNull();
	});

	it('reads its wear in its own unit', () => {
		expect(wearAmount(1, 'hit')).toBe('1 hit');
		expect(wearAmount(40, 'shot')).toBe('40 shots');
		expect(wearAmount(600, 'second')).toBe('10 min');
	});
});

describe('broken things do nothing', () => {
	it('a coat breaks instead of being torn apart, and then takes nothing', () => {
		const inv = emptyInventory();
		inv.equipment.defense = newStack('coat');
		const shield = ITEMS.coat.defense!.shield;
		expect(absorbBlow(inv, 10)).toEqual({ through: 0, broke: null });
		expect(absorbBlow(inv, shield)).toEqual({ through: 10, broke: 'coat' });
		expect(inv.equipment.defense?.item).toBe('coat');
		expect(isBroken(inv.equipment.defense)).toBe(true);
		expect(shieldOf(inv)).toEqual({ left: 0, max: shield });
		// Still worn, but every blow goes straight through now.
		expect(absorbBlow(inv, 15)).toEqual({ through: 15, broke: null });
	});

	it('a broken crowbar in the hand pries nothing', () => {
		const inv = emptyInventory();
		inv.equipment.primary = newStack('crowbar');
		expect(heldWorking(inv, 'pry')).not.toBeNull();
		wreck(inv.equipment.primary);
		expect(heldWorking(inv, 'pry')).toBeNull();
	});

	it('broken gear is still in its slot, but not working', () => {
		const inv = emptyInventory();
		inv.equipment.gear1 = newStack('test.kneepads');
		inv.equipment.gear2 = newStack('test.kneepads');
		wreck(inv.equipment.gear2);
		expect(workingGear(inv)).toEqual([inv.equipment.gear1]);
	});
});

describe('selling worn things', () => {
	it('sells for what is left of it, a broken one for nothing', () => {
		const coat = newStack('coat');
		const full = sellPrice('coat', coat);
		expect(full).toBe(sellPrice('coat'));
		coat.worn = ITEMS.coat.durability!.max / 2;
		expect(sellPrice('coat', coat)).toBe(Math.floor(full / 2));
		wreck(coat);
		expect(sellPrice('coat', coat)).toBe(0);
	});

	it('loot sells at its value whatever happens to it, things not sold at a share of their price', () => {
		expect(sellPrice('relic')).toBe(ITEMS.relic.value);
		expect(sellPrice('test.kneepads')).toBe(16);
		expect(sellPrice('hand-of-glory')).toBe(0);
	});
});
