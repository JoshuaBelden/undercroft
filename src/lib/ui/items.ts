import { sellPrice } from '#lib/content/economy.ts';
import { ITEMS, type ItemCategory } from '#lib/content/items.ts';
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

/** The small print in the corner of a slot: rounds loaded in a firearm. */
export function stackDetail(stack: ItemStack): string | undefined {
	const gun = ITEMS[stack.item]?.firearm;
	return gun ? `${stack.loaded ?? 0}/${gun.magazine}` : undefined;
}

/** What each category is called: the stash filters and the tooltip. */
export const CATEGORY_LABELS: Record<ItemCategory, string> = {
	weapon: 'Weapon',
	defense: 'Defense',
	quick: 'Quick use',
	other: 'Other'
};

/** The filter icons (`ItemFilters`), each drawn in a 24-unit box. Slots show some of them too. */
export const FILTER_ICONS: Record<ItemFilter, string> = {
	all: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
	weapon: 'M19.5 3 21 4.5 10 15.5 8.5 14zM8 13l3 3-1.5 1.5-1-1L5 20l-1-1 3.500-3.500-1-1z',
	ammo: 'M12 2c2 1.800 3 4.200 3 7v9H9V9c0-2.800 1-5.200 3-7zM9 19.500h6V22H9z',
	defense: 'M12 3l7 2.500v6c0 4.500-3 7.800-7 9.500-4-1.700-7-5-7-9.500v-6z',
	quick: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
	treasure: 'M7 4h10l4 5-9 11L3 9z',
	quest: 'M12 2l2.500 7.500L22 12l-7.500 2.500L12 22l-2.500-7.500L2 12l7.500-2.500z',
	other:
		'M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z'
};

/**
 * The mark in the bottom-left corner of an item's slot: its filter icon, for quest items,
 * weapons, defense and treasure. Other things have none.
 */
export function slotMark(item: string): { icon: string; label: string } | undefined {
	const def = ITEMS[item];
	if (!def) return undefined;
	if (def.quest) return { icon: FILTER_ICONS.quest, label: 'Quest item' };
	if (def.treasure) return { icon: FILTER_ICONS.treasure, label: 'Treasure' };
	if (def.category === 'weapon') return { icon: FILTER_ICONS.weapon, label: 'Weapon' };
	if (def.category === 'defense') return { icon: FILTER_ICONS.defense, label: 'Defense' };
	return undefined;
}

/** What an item is called in its tooltip: its category, or Treasure, or Quest item. */
export function categoryLabel(item: string): string {
	const def = ITEMS[item];
	if (!def) return '';
	if (def.quest) return 'Quest item';
	return def.treasure ? 'Treasure' : CATEGORY_LABELS[def.category];
}

/**
 * What a grid of items is showing: everything, one category, ammunition, treasure or quest items
 * (`ItemFilters`). Ammunition, treasure and quest items are in the `other` category for
 * slotting, but have filters of their own.
 */
export type ItemFilter = 'all' | ItemCategory | 'ammo' | 'treasure' | 'quest';

/**
 * Whether an item is shown under a filter. Ammunition is listed under `ammo`, treasure under
 * `treasure` and quest items under `quest`, not under `other`.
 */
export function matchesFilter(item: string, filter: ItemFilter): boolean {
	if (filter === 'all') return true;
	const def = ITEMS[item];
	if (!def) return false;
	if (def.quest) return filter === 'quest';
	if (def.kind === 'ammo') return filter === 'ammo';
	if (def.treasure) return filter === 'treasure';
	return def.category === filter;
}

/** One figure in a tooltip. `coins`: the value is money, drawn after the coin sign. */
export interface ItemStat {
	label: string;
	value: string;
	coins: boolean;
}

/** The coin sign, as in the top bar. */
export const COIN_SIGN = '＄';

/**
 * The figures that matter for a stack, for the tooltip: only those that apply to it. `forSale` is
 * a stack in the store, not one you own: what it holds and stacks to, not what is in it now.
 */
export function itemStats(stack: ItemStack, forSale = false): ItemStat[] {
	const def = ITEMS[stack.item];
	if (!def) return [];
	const stats: ItemStat[] = [];
	const add = (label: string, value: string, coins = false) => stats.push({ label, value, coins });
	if (def.firearm) {
		const gun = def.firearm;
		add('Damage', gun.pellets > 1 ? `${gun.damage} × ${gun.pellets}` : `${gun.damage}`);
		add('Range', `${gun.range} m`);
		if (forSale) add('Holds', `${gun.magazine}`);
		else add('Loaded', `${stack.loaded ?? 0} / ${gun.magazine}`);
		add('Takes', ITEMS[gun.ammo]?.name ?? gun.ammo);
	}
	if (def.melee) {
		add('Damage', `${def.melee.damage}`);
		add('Reach', `${def.melee.range} m`);
		add('Swing', `${(def.melee.windup + def.melee.recovery).toFixed(1)} s`);
		if (def.melee.breaksAfter) {
			add(
				forSale ? 'Breaks after' : 'Blows left',
				`${Math.max(0, def.melee.breaksAfter - (stack.uses ?? 0))}`
			);
		}
	}
	if (def.throwable) add('Thrown', `${def.throwable.damage} damage`);
	if (def.heal) {
		add('Restores', `${def.heal.amount} sanity`);
		add('Takes', `${def.heal.seconds} s, standing still`);
	}
	if (def.charge) {
		add('Charges', `${def.charge.volts}V into the headlamp`);
		add('Takes', `${def.charge.seconds} s, standing still`);
	}
	if (def.revive) add('Use', 'Revives the downed');
	if (def.defense) {
		const { shield } = def.defense;
		add('Shield', forSale ? `${shield}` : `${Math.max(0, shield - (stack.worn ?? 0))} / ${shield}`);
	}
	add('Weight', stackKilos(stack));
	if (def.maxStack > 1) {
		if (forSale) add('Stacks to', `${def.maxStack}`);
		else add('Stack', `${stack.count} / ${def.maxStack}`);
	}
	const price = sellPrice(stack.item);
	// One's price, with the coin sign of the top bar in front.
	if (price > 0 && !forSale) add('Sells for', `${price}`, true);
	return stats;
}
