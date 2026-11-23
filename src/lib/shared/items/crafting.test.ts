import { describe, expect, it } from 'vitest';
import { openTiers, saleTotal, sellPrice, stackSale } from '../../content/economy.ts';
import { ITEMS } from '../../content/items.ts';
import { RECIPES, REPAIRS, SALVAGE } from '../../content/recipes.ts';
import {
	craftedValue,
	discoverable,
	foundIn,
	fragmentFinds,
	madeRecipes,
	materialSlots,
	onHand,
	productKnown,
	recipeFor,
	recipeStatus,
	repairCost,
	salvageOf
} from './crafting.ts';
import { addToSlots, newStack } from './inventory.ts';

/** Crafting rules (docs/dev/crafting.md): discovery, recipes, repair, salvage, the crafted mark. */

const first = <T>(items: T[]): T => items[0];

describe('the recipe data', () => {
	it('names only real items, makes no gun nor rounds, and every ingredient can be discovered', () => {
		for (const r of RECIPES) {
			expect(ITEMS[r.makes], r.id).toBeDefined();
			// No gun that fires rounds, nor rounds: a crossbow, a slingshot and bolts are built.
			const def = ITEMS[r.makes];
			if (def.firearm) expect(def.firearm.projectile, r.id).toBeDefined();
			if (def.kind === 'ammo') {
				const fires = Object.values(ITEMS).filter((g) => g.firearm?.ammo === r.makes);
				expect(
					fires.every((g) => g.firearm?.projectile),
					r.id
				).toBe(true);
			}
			// A recipe a quest teaches is known without discovering its ingredients (a quest gives them).
			if (r.learned) continue;
			for (const i of r.ingredients) expect(discoverable(i.item), `${r.id}: ${i.item}`).toBe(true);
		}
		for (const [item, list] of [...Object.entries(REPAIRS), ...Object.entries(SALVAGE)]) {
			expect(ITEMS[item], item).toBeDefined();
			for (const i of list) expect(ITEMS[i.item], `${item}: ${i.item}`).toBeDefined();
		}
	});

	it('a weapon that can be crafted is never sold', async () => {
		const { SHOP } = await import('../../content/economy.ts');
		for (const r of RECIPES) {
			if (ITEMS[r.makes].category !== 'weapon') continue;
			expect(
				SHOP.some((e) => e.item === r.makes),
				r.makes
			).toBe(false);
		}
	});
});

describe('discovery', () => {
	it('what a lootable holds can be discovered; what only lies loose (bricks, pebbles) cannot', () => {
		expect(discoverable('rags')).toBe(true);
		expect(foundIn('rags')).toContain('crate');
		expect(discoverable('brick')).toBe(false);
		expect(discoverable('pebbles')).toBe(false);
		expect(discoverable('clue')).toBe(false);
		expect(discoverable('recipe-fragment')).toBe(false);
		// A font is a lootable too: what it fills is found there.
		expect(foundIn('holy-water')).toContain('font');
	});

	it('a recipe is hidden, started, then available as its ingredients are discovered', () => {
		const bandage = recipeFor('bandage')!;
		const candle = recipeFor('candle')!;
		expect(recipeStatus(bandage, new Set())).toBe('hidden');
		expect(recipeStatus(candle, new Set(['wax']))).toBe('started');
		expect(recipeStatus(candle, new Set(['wax', 'twine']))).toBe('available');
		expect(recipeStatus(bandage, new Set(['rags']))).toBe('available');
	});

	it('a fragment finds an ingredient of a started recipe first, then of any, then nothing', () => {
		const started = fragmentFinds(new Set(['wax']), first);
		const candle = recipeFor('candle')!;
		const mine = RECIPES.filter((r) => recipeStatus(r, new Set(['wax'])) === 'started');
		expect(mine.some((r) => r.ingredients.some((i) => i.item === started))).toBe(true);
		expect(started).not.toBe('wax');
		expect(candle.ingredients.map((i) => i.item)).toContain('twine');
		const fresh = fragmentFinds(new Set(), first);
		expect(RECIPES.some((r) => r.ingredients.some((i) => i.item === fresh))).toBe(true);
		const everything = new Set(RECIPES.flatMap((r) => r.ingredients.map((i) => i.item)));
		expect(fragmentFinds(everything, first)).toBeNull();
	});
});

describe('the Workshop rules', () => {
	it('mending costs its materials and coin by the wear; a new one needs none', () => {
		const crowbar = newStack('crowbar');
		expect(repairCost(crowbar)).toBeNull();
		crowbar.worn = ITEMS.crowbar.durability!.max / 2;
		const cost = repairCost(crowbar)!;
		expect(cost.materials).toEqual([{ item: 'metal', count: 1 }]);
		expect(cost.coin).toBe(Math.ceil(ITEMS.crowbar.price! * 0.2 * 0.5));
		expect(repairCost(newStack('coins'))).toBeNull();
	});

	it('salvage gives the materials; rope by the length', () => {
		expect(salvageOf(newStack('crowbar'))).toEqual([{ item: 'metal', count: 2 }]);
		expect(salvageOf(newStack('rope-pack'))).toEqual([{ item: 'rope-length', count: 20 }]);
		expect(salvageOf(newStack('coins'))).toEqual([]);
	});

	it('something crafted sells for its materials, never more', () => {
		const coat = { ...newStack('coat'), crafted: true };
		const materials = craftedValue('coat', (m) => sellPrice(m));
		expect(sellPrice('coat', coat)).toBe(materials);
		expect(sellPrice('coat', coat)).toBeLessThan(sellPrice('coat'));
		// Bolts come three at a time: each sells for a third of what went in.
		expect(craftedValue('bolts', (m) => sellPrice(m))).toBeCloseTo((1 + 0.2) / 3);
	});

	it('crafted and found stacks of the same thing stay apart', () => {
		const slots = [null, null];
		addToSlots(slots, newStack('bandage', 1));
		addToSlots(slots, { ...newStack('bandage', 1), crafted: true });
		expect(slots.filter(Boolean)).toHaveLength(2);
	});
});

describe('store tiers', () => {
	it('open with the merchant’s trust and resolving the Gloaming', () => {
		expect(openTiers(0, [])).toEqual(['start']);
		expect(openTiers(1000, [])).toEqual(['start', 'trusted']);
		expect(openTiers(5000, ['gloaming']).sort()).toEqual(
			['start', 'trusted', 'gloaming', 'valued'].sort()
		);
		expect(openTiers(0, ['gloaming'])).toEqual(['start', 'gloaming']);
	});
});

describe('what a recipe makes', () => {
	it('is known once made (a first kept in progression), or when a quest taught it', () => {
		const made = new Set(madeRecipes(['loot:crate', 'recipe:bandage', 'kill:witch']));
		expect([...made]).toEqual(['bandage']);
		const bandage = RECIPES.find((r) => r.id === 'bandage')!;
		const other = RECIPES.find((r) => r.id !== 'bandage' && !r.learned)!;
		const taught = RECIPES.find((r) => r.learned)!;
		expect(productKnown(bandage, made)).toBe(true);
		expect(productKnown(other, made)).toBe(false);
		expect(productKnown(taught, new Set())).toBe(true);
	});
});

describe('Workshop materials', () => {
	it('count the stash, then the backpack and quick slots; never what is equipped', () => {
		const slots = materialSlots([newStack('rags', 1), null], {
			backpack: [newStack('rags', 3)],
			quick: [newStack('rags', 2)]
		});
		expect(onHand(slots, 'rags')).toBe(6);
		expect(onHand(slots, 'wax')).toBe(0);
	});
});

describe('sell prices', () => {
	it('a sale is always whole coin, rounded up: new, worn, made, one or many', () => {
		for (const def of Object.values(ITEMS)) {
			const max = def.durability?.max ?? 0;
			const stacks = [
				newStack(def.id),
				{ ...newStack(def.id), worn: max / 3 },
				{ ...newStack(def.id), crafted: true },
				{ ...newStack(def.id), crafted: true, worn: max / 3 }
			];
			for (const stack of stacks) {
				const total = stackSale(stack);
				expect(Number.isInteger(total), def.id).toBe(true);
				expect(total, def.id).toBeGreaterThanOrEqual(sellPrice(def.id, stack) * stack.count - 1e-6);
			}
		}
		// Nails are a tenth each: one sells for a coin, ten for a coin, eleven for two.
		expect(saleTotal(0.1, 1)).toBe(1);
		expect(saleTotal(0.1, 10)).toBe(1);
		expect(saleTotal(0.1, 11)).toBe(2);
		expect(saleTotal(0, 5)).toBe(0);
	});
});
