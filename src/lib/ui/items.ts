import { money, sellPrice } from '#lib/content/economy.ts';
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

/** The figures that matter for a stack, for the tooltip: only those that apply to it. */
export function itemStats(stack: ItemStack): { label: string; value: string }[] {
	const def = ITEMS[stack.item];
	if (!def) return [];
	const stats: { label: string; value: string }[] = [];
	const add = (label: string, value: string) => stats.push({ label, value });
	if (def.firearm) {
		const gun = def.firearm;
		add('Damage', gun.pellets > 1 ? `${gun.damage} × ${gun.pellets}` : `${gun.damage}`);
		add('Range', `${gun.range} m`);
		add('Loaded', `${stack.loaded ?? 0} / ${gun.magazine}`);
		add('Takes', ITEMS[gun.ammo]?.name ?? gun.ammo);
	}
	if (def.melee) {
		add('Damage', `${def.melee.damage}`);
		add('Reach', `${def.melee.range} m`);
		add('Swing', `${(def.melee.windup + def.melee.recovery).toFixed(1)} s`);
		if (def.melee.breaksAfter) {
			add('Blows left', `${Math.max(0, def.melee.breaksAfter - (stack.uses ?? 0))}`);
		}
	}
	if (def.throwable) add('Thrown', `${def.throwable.damage} damage`);
	if (def.heal) {
		add('Restores', `${def.heal.amount} sanity`);
		add('Takes', `${def.heal.seconds} s, standing still`);
	}
	if (def.revive) add('Use', 'Revives the downed');
	if (def.defense) add('Protection', `${Math.round(def.defense.reduction * 100)}% off attacks`);
	add('Weight', stackKilos(stack));
	if (def.maxStack > 1) add('Stack', `${stack.count} / ${def.maxStack}`);
	const price = sellPrice(stack.item);
	if (price > 0) add('Sells for', stack.count > 1 ? `${money(price)} each` : money(price));
	return stats;
}
