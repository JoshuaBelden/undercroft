import { ITEMS, type ItemDef } from '../../content/items.ts';
import type { Inventory } from '../player/types.ts';
import { works } from './durability.ts';
import { workingGear } from './inventory.ts';

/**
 * What worn things do (docs/dev/items.md#gear): gear in the gear slots and the coat or jerkin in
 * the defense slot, when they aren't broken. Shared, so the client predicts movement exactly as
 * the server runs it.
 */

/** The defs of the gear worn and working. */
export function wornGear(inv: Inventory): ItemDef[] {
	return workingGear(inv).flatMap((stack) => (ITEMS[stack.item] ? [ITEMS[stack.item]] : []));
}

/** The product of a number every worn gear may give (1 with none). */
function product(inv: Inventory, pick: (def: ItemDef) => number | undefined): number {
	return wornGear(inv).reduce((f, def) => f * (pick(def) ?? 1), 1);
}

/** How much faster crawling is (kneepads). */
export function crawlFactor(inv: Inventory): number {
	return product(inv, (def) => def.crawl?.speed);
}

/** How much faster climbing a rope is (gloves). */
export function climbFactor(inv: Inventory): number {
	return product(inv, (def) => def.climb);
}

/** How much of a sprint is left by what is worn in the defense slot (a jerkin slows it). */
export function sprintFactor(inv: Inventory): number {
	const coat = inv.equipment.defense ?? null;
	if (!coat || !works(coat)) return 1;
	return ITEMS[coat.item]?.sprint ?? 1;
}

/**
 * How loud moving is, by what is worn: crawling with kneepads, any other step with felt
 * overshoes. 1 is as loud as ever.
 */
export function stepLoudness(inv: Inventory, crawling: boolean): number {
	return product(inv, (def) => (crawling ? def.crawl?.quiet : def.steps?.quiet));
}

/** Whether something worn gives a bearing to the way out (a pocket compass). */
export function hasCompass(inv: Inventory): boolean {
	return wornGear(inv).some((def) => def.compass);
}
