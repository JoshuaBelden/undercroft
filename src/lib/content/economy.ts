import { ITEMS } from './items.ts';

/**
 * Money: what the shop sells and what things sell for. Shared by the shop overlay (prices shown)
 * and the server (prices charged). See docs/dev/economy.md.
 */

export interface ShopEntry {
	/** Key into ITEMS. */
	item: string;
	/** Price of one lot. */
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

/** What the shop sells, in the order shown. Firearms come empty. */
export const SHOP: ShopEntry[] = [
	{ item: 'bandage', price: 15, lot: 1 },
	{ item: 'salts', price: 40, lot: 1 },
	{ item: 'chalk', price: 5, lot: 1 },
	{ item: 'candle', price: 4, lot: 1 },
	{ item: 'knife', price: 20, lot: 1 },
	{ item: 'crowbar', price: 60, lot: 1 },
	{ item: 'coat', price: 90, lot: 1 },
	{ item: 'revolver', price: 150, lot: 1 },
	{ item: 'ammo.revolver', price: 12, lot: 6 },
	{ item: 'shotgun', price: 250, lot: 1 },
	{ item: 'ammo.shotgun', price: 16, lot: 4 }
];

/** What one of an item sells for: loot its value, shop gear a fraction of its price, else 0. */
export function sellPrice(item: string): number {
	const value = ITEMS[item]?.value;
	if (value !== undefined) return value;
	const entry = SHOP.find((e) => e.item === item);
	return entry ? Math.floor((entry.price / entry.lot) * ECONOMY.sellBack) : 0;
}

/** "25 coin". */
export function money(amount: number): string {
	return `${amount} ${ECONOMY.currency}`;
}
