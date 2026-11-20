import { ITEMS } from '../../content/items.ts';
import { LOOTABLES } from '../../content/lootables.ts';
import {
	CRAFT,
	RECIPES,
	REPAIRS,
	SALVAGE,
	type Ingredient,
	type Recipe
} from '../../content/recipes.ts';
import type { ItemStack } from '../player/types.ts';
import { lasting, wearOf } from './durability.ts';

/**
 * Crafting rules, shared by the Workshop (the site's server), field crafting (the game server)
 * and the Library and Workshop pages (docs/dev/crafting.md).
 */

/** Where an item can be discovered: the lootables whose tables name it (a font: what it fills). */
export function foundIn(item: string): string[] {
	return Object.values(LOOTABLES)
		.filter((def) => def.loot.some((e) => e.item === item) || def.fill?.makes === item)
		.map((def) => def.id);
}

/** Whether an item can be discovered at all: something holds it. Things only found loose can't. */
export function discoverable(item: string): boolean {
	const def = ITEMS[item];
	if (!def || def.quest || def.kind === 'clue' || def.fragment) return false;
	return foundIn(item).length > 0;
}

/**
 * How far along a recipe is: `hidden` (no ingredient discovered: not in the Library), `started`
 * (some: listed, the rest shown as ?) or `available` (all: it can be made).
 */
export function recipeStatus(
	recipe: Recipe,
	discovered: ReadonlySet<string>
): 'hidden' | 'started' | 'available' {
	const known = recipe.ingredients.filter((i) => discovered.has(i.item)).length;
	if (known === 0) return 'hidden';
	return known === recipe.ingredients.length ? 'available' : 'started';
}

/** Recipes that use an item. */
export function recipesUsing(item: string): Recipe[] {
	return RECIPES.filter((r) => r.ingredients.some((i) => i.item === item));
}

/** Whether `count(item)` covers a recipe's ingredients `times` over. */
export function hasIngredients(
	recipe: Recipe,
	count: (item: string) => number,
	times = 1
): boolean {
	return recipe.ingredients.every((i) => count(i.item) >= i.count * times);
}

/**
 * What mending a stack takes: its materials and coin (`CRAFT.repairShare` of its price, by the
 * share of it worn). Null for what can't be mended, or isn't worn at all.
 */
export function repairCost(stack: ItemStack): { coin: number; materials: Ingredient[] } | null {
	const def = ITEMS[stack.item];
	const materials = REPAIRS[stack.item];
	const last = lasting(def);
	if (!def || !materials || !last || last.usedUp) return null;
	const worn = Math.min(1, wearOf(stack) / last.max);
	if (worn <= 0) return null;
	return { coin: Math.ceil((def.price ?? 0) * CRAFT.repairShare * worn), materials };
}

/** What a stack breaks down into: its materials (rope by the metres left); nothing if it can't. */
export function salvageOf(stack: ItemStack): Ingredient[] {
	// From the free loadout: its materials would be coin.
	if (stack.free) return [];
	const def = ITEMS[stack.item];
	if (def?.rope) {
		const lengths = Math.floor(def.rope.length / CRAFT.ropePerLength) * stack.count;
		return lengths > 0 ? [{ item: 'rope-length', count: lengths }] : [];
	}
	return (SALVAGE[stack.item] ?? []).map((i) => ({ item: i.item, count: i.count * stack.count }));
}

/** The recipe that makes an item, if any. */
export function recipeFor(item: string): Recipe | undefined {
	return RECIPES.find((r) => r.makes === item);
}

/**
 * What one crafted item sells for: what its recipe's materials would (the share of it, for a
 * recipe that makes several), so making things never makes coin.
 */
export function craftedValue(item: string, sell: (item: string) => number): number {
	const recipe = recipeFor(item);
	if (!recipe) return 0;
	const total = recipe.ingredients.reduce((sum, i) => sum + sell(i.item) * i.count, 0);
	return total / recipe.count;
}

/**
 * What reading a recipe fragment discovers: an ingredient not yet seen of a recipe already
 * started; with none started, one of any recipe (which starts it); null with nothing left to find.
 * `pick` chooses among the candidates (seeded on the server).
 */
export function fragmentFinds(
	discovered: ReadonlySet<string>,
	pick: <T>(items: T[]) => T
): string | null {
	const missing = (r: Recipe) =>
		r.ingredients.map((i) => i.item).filter((item) => !discovered.has(item) && discoverable(item));
	const started = RECIPES.filter(
		(r) => recipeStatus(r, discovered) === 'started' && missing(r).length
	);
	const pool = started.length ? started : RECIPES.filter((r) => missing(r).length);
	if (!pool.length) return null;
	return pick(missing(pick(pool)));
}
