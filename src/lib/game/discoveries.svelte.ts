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
