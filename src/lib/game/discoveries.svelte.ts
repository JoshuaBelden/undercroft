import { SvelteSet } from 'svelte/reactivity';

/**
 * What this player has discovered, as the play page knows it (docs/dev/crafting.md#discovery):
 * what their account held when they came down, and what they discover on the way. The field
 * crafting tab reads it to show what can be made.
 */
export const discoveries = new SvelteSet<string>();

/** Start again from what the account knows. */
export function knowDiscoveries(items: Iterable<string>): void {
	discoveries.clear();
	for (const item of items) discoveries.add(item);
}

/**
 * The recipes this player has made at least once (docs/dev/crafting.md#what-a-recipe-makes): what
 * their account held when they came down, and what they make on the way. Until then the Craft tab
 * shows a recipe's product as ? and ???.
 */
export const made = new SvelteSet<string>();

/** Start again from what the account knows. */
export function knowMade(recipes: Iterable<string>): void {
	made.clear();
	for (const recipe of recipes) made.add(recipe);
}
