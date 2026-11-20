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
	/** The store tier that sells it (docs/handoff-gear-crafting-loot.md#store-tiers). */
	tier: StoreTier;
}

/**
 * The store's tiers, in the order they open: the start, the merchant's trust (coin sold, in all)
 * and resolving the Gloaming open the rest.
 */
export type StoreTier = 'start' | 'trusted' | 'gloaming' | 'valued';

/** Tiers open to everyone for now; trust and resolved Afflictions open the rest (the Workshop's round). */
export const OPEN_TIERS: StoreTier[] = ['start'];

export const ECONOMY = {
	/** What money is called, after a number. */
	currency: 'coin',
	/** Gear sells back for this fraction of what it costs. */
	sellBack: 0.4
};

/** A store line for an item, at its own `price`. */
function ware(tier: StoreTier, item: string, lot = 1): ShopEntry {
	const price = ITEMS[item]?.price;
	if (price === undefined) throw new Error(`The store sells ${item}, which has no price`);
	return { item, price: price * lot, lot, tier };
}

/**
 * Everything the store sells, tier by tier, in the order shown. Firearms come empty. What is
 * never sold (the knife, the hatchet, the crossbow...) is found or crafted.
 */
export const SHOP: ShopEntry[] = [
	ware('start', 'bandage'),
	ware('start', 'salts'),
	ware('start', 'battery'),
	ware('start', 'chalk'),
	ware('start', 'candle'),
	ware('start', 'rope-pack'),
	ware('start', 'notebook'),
	ware('start', 'whistle'),
	ware('start', 'glow-sticks', 3),
	ware('start', 'bait'),
	ware('start', 'crafting-kit'),
	ware('start', 'crowbar'),
	ware('start', 'coat'),
	ware('start', 'revolver'),
	ware('start', 'ammo.revolver', 6),
	ware('trusted', 'medkit'),
	ware('trusted', 'lockpicks'),
	ware('trusted', 'firecrackers'),
	ware('trusted', 'compass'),
	ware('trusted', 'gun-oil'),
	ware('trusted', 'trench-spade'),
	ware('trusted', 'shotgun'),
	ware('trusted', 'ammo.shotgun', 4),
	ware('gloaming', 'laudanum'),
	ware('gloaming', 'pitons', 3),
	ware('gloaming', 'kneepads'),
	ware('gloaming', 'overshoes'),
	ware('gloaming', 'gloves'),
	ware('gloaming', 'derringer'),
	ware('valued', 'censer'),
	ware('valued', 'jerkin'),
	ware('valued', 'pickaxe'),
	ware('valued', 'sledgehammer'),
	ware('valued', 'rifle'),
	ware('valued', 'ammo.rifle', 5)
];

/** What is for sale with these tiers open. */
export function forSale(tiers: readonly StoreTier[] = OPEN_TIERS): ShopEntry[] {
	return SHOP.filter((entry) => tiers.includes(entry.tier));
}

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
