import { condition } from '../shared/items/durability.ts';
import type { ItemStack } from '../shared/player/types.ts';
import { ITEMS } from './items.ts';

/**
 * Money: what the shop sells and what things sell for. Shared by the shop overlay (prices shown)
 * and the server (prices charged). Every price comes from the item's own `price` (or `value`),
 * so the store, selling back and (later) repairs all agree. See docs/dev/economy.md.
 */

export interface ShopEntry {
	/** Key into ITEMS. */
	item: string;
	/** Price of one lot: the item's `price` times `lot`. */
	price: number;
	/** How many you get for that price (rounds come by the handful). */
	lot: number;
}

export const ECONOMY = {
	/** What money is called, after a number. */
	currency: 'coin',
	/** Gear sells back for this fraction of what it costs. */
	sellBack: 0.4
};

/** A store line for an item, at its own `price`. */
function ware(item: string, lot = 1): ShopEntry {
	const price = ITEMS[item]?.price;
	if (price === undefined) throw new Error(`The store sells ${item}, which has no price`);
	return { item, price: price * lot, lot };
}

/** What the shop sells, in the order shown. Firearms come empty. */
export const SHOP: ShopEntry[] = [
	ware('bandage'),
	ware('salts'),
	ware('medkit'),
	ware('chalk'),
	ware('rope-pack'),
	ware('notebook'),
	ware('candle'),
	ware('knife'),
	ware('crowbar'),
	ware('coat'),
	ware('revolver'),
	ware('ammo.revolver', 6),
	ware('shotgun'),
	ware('ammo.shotgun', 4)
];

/**
 * What one of an item sells for: loot its `value`, anything else a share (`ECONOMY.sellBack`) of
 * its `price`, else 0. Give the stack to count its wear: a worn thing sells for what is left of it,
 * and a broken one for nothing.
 */
export function sellPrice(item: string, stack?: ItemStack): number {
	const def = ITEMS[item];
	if (!def) return 0;
	if (def.value !== undefined) return def.value;
	const left = stack ? (condition(stack) ?? 1) : 1;
	return Math.floor((def.price ?? 0) * ECONOMY.sellBack * left);
}

/** "25 coin". */
export function money(amount: number): string {
	return `${amount} ${ECONOMY.currency}`;
}
