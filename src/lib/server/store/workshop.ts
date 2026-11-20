import type { Db } from 'mongodb';
import { ITEMS } from '../../content/items.ts';
import { RECIPES, type Ingredient } from '../../content/recipes.ts';
import {
	hasIngredients,
	recipeStatus,
	repairCost,
	salvageOf
} from '../../shared/items/crafting.ts';
import {
	addToSlots,
	getSlot,
	newStack,
	sanitizeRef,
	takeStack,
	type Slots
} from '../../shared/items/inventory.ts';
import type { ExplorerDoc } from './accounts.ts';
import { discoveriesOf } from './discoveries.ts';
import { changeExplorer, type ExplorerError } from './explorers.ts';
import { log } from './shop.ts';

/**
 * The Workshop (docs/dev/crafting.md#the-workshop): crafting from the stash, mending (materials
 * from the stash, and coin), and breaking things down into materials. Each is one change to the
 * explorer, all of it or none.
 */

type Result = Promise<{ explorer: ExplorerDoc } | { error: ExplorerError }>;

/** How many of an item the stash holds. */
function inStash(stash: Slots, item: string): number {
	return stash.reduce((n, stack) => n + (stack?.item === item ? stack.count : 0), 0);
}

/** Take materials out of the stash. False (and the stash as it was) if there aren't enough. */
function spend(stash: Slots, materials: Ingredient[], times = 1): boolean {
	if (!materials.every((m) => inStash(stash, m.item) >= m.count * times)) return false;
	for (const { item, count } of materials) {
		let left = count * times;
		for (let i = 0; i < stash.length && left > 0; i++) {
			const stack = stash[i];
			if (stack?.item !== item) continue;
			const used = Math.min(stack.count, left);
			stack.count -= used;
			left -= used;
			if (stack.count === 0) stash[i] = null;
		}
	}
	return true;
}

/** Make a recipe `times` times, from the stash, into the stash. It has to be available. */
export async function craft(db: Db, explorerId: string, recipeId: unknown, times: unknown): Result {
	const recipe = RECIPES.find((r) => r.id === recipeId);
	const n = typeof times === 'number' && Number.isInteger(times) ? times : 1;
	if (!recipe || n < 1 || n > 20) return { error: 'unknownRecipe' };
	const result = await changeExplorer(db, explorerId, (explorer) => {
		const discovered = new Set(Object.keys(discoveriesOf(explorer)));
		if (recipeStatus(recipe, discovered) !== 'available') return 'undiscovered';
		if (!hasIngredients(recipe, (item) => inStash(explorer.stash, item), n)) return 'materials';
		spend(explorer.stash, recipe.ingredients, n);
		const made = { ...newStack(recipe.makes, recipe.count * n), crafted: true };
		if (addToSlots(explorer.stash, made) > 0) return 'stashFull';
		return null;
	});
	if ('explorer' in result) {
		await log(db, {
			explorer: explorerId,
			kind: 'craft',
			item: recipe.makes,
			count: recipe.count * n,
			money: 0,
			balance: result.explorer.money
		});
	}
	return result;
}

/** Mend a stack in the stash or the loadout: its materials from the stash, and coin. */
export async function repair(db: Db, explorerId: string, at: unknown): Result {
	const ref = sanitizeRef(at, true);
	if (!ref) return { error: 'missing' };
	let paid = 0;
	let item = '';
	const result = await changeExplorer(db, explorerId, (explorer) => {
		const stack = getSlot({ inventory: explorer.loadout, stash: explorer.stash }, ref);
		if (!stack) return 'missing';
		const cost = repairCost(stack);
		if (!cost) return 'unrepairable';
		if (explorer.money < cost.coin) return 'money';
		if (!spend(explorer.stash, cost.materials)) return 'materials';
		explorer.money -= cost.coin;
		delete stack.worn;
		paid = cost.coin;
		item = stack.item;
		return null;
	});
	if ('explorer' in result) {
		await log(db, {
			explorer: explorerId,
			kind: 'repair',
			item,
			count: 1,
			money: -paid,
			balance: result.explorer.money
		});
	}
	return result;
}

/** Break a stack in the stash or the loadout down into its materials, into the stash. */
export async function salvage(db: Db, explorerId: string, at: unknown): Result {
	const ref = sanitizeRef(at, true);
	if (!ref) return { error: 'missing' };
	let item = '';
	let count = 0;
	const result = await changeExplorer(db, explorerId, (explorer) => {
		const b = { inventory: explorer.loadout, stash: explorer.stash };
		const there = getSlot(b, ref);
		if (!there) return 'missing';
		const materials = salvageOf(there);
		if (!materials.length || ITEMS[there.item]?.treasure) return 'unsalvageable';
		const stack = takeStack(b, ref, there.count);
		if (!stack) return 'missing';
		for (const m of materials) {
			if (addToSlots(explorer.stash, newStack(m.item, m.count)) > 0) return 'stashFull';
		}
		item = stack.item;
		count = stack.count;
		return null;
	});
	if ('explorer' in result) {
		await log(db, {
			explorer: explorerId,
			kind: 'salvage',
			item,
			count,
			money: 0,
			balance: result.explorer.money
		});
	}
	return result;
}
