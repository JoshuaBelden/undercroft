import { ITEMS } from '#lib/content/items.ts';
import type { ItemStack } from '#lib/shared/player/types.ts';

/** How a stack reads in a list: its name, rounds loaded for a firearm, or the count. */
export function stackLabel(stack: ItemStack): string {
	const def = ITEMS[stack.item];
	const name = def?.name ?? stack.item;
	if (def?.firearm) {
		const loaded = `${name} (${stack.loaded ?? 0}/${def.firearm.magazine})`;
		return stack.count > 1 ? `${loaded} × ${stack.count}` : loaded;
	}
	return stack.count > 1 ? `${name} × ${stack.count}` : name;
}

/** A stack's weight, e.g. "2.5 kg". */
export function stackKilos(stack: ItemStack): string {
	return `${((ITEMS[stack.item]?.weight ?? 0) * stack.count).toFixed(1)} kg`;
}
