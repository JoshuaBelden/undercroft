import { sellPrice } from '#lib/content/economy.ts';
import { CONDITIONS } from '#lib/content/player/conditions.ts';
import { ITEMS, type ItemCategory, type WearUnit } from '#lib/content/items.ts';
import { condition, isBroken, lasting, wearAmount, wearOf } from '#lib/shared/items/durability.ts';
import type { ItemStack } from '#lib/shared/player/types.ts';

/**
 * How worn a stack is, for its tooltip and Inspect panel: what is left (0..1, and as a whole
 * percent) and whether it is broken. Null for things that never wear.
 */
export function stackCondition(
	stack: ItemStack
): { left: number; percent: number; broken: boolean } | null {
	const left = condition(stack);
	if (left === null) return null;
	// Never "0%" for something that still works, nor "100%" for something with any wear.
	const raw = left * 100;
	const percent = left <= 0 ? 0 : left >= 1 ? 100 : Math.min(99, Math.max(1, Math.round(raw)));
	return { left, percent, broken: isBroken(stack) };
}

/** The mark drawn on a broken item's slot (`Slot`'s `broken`): a crack, in a 24-unit box. */
export const BROKEN_ICON =
	'M13.500 2 9 9.500l3.500 2.500L8 22l2.500-.500 5-9.500L12 9.500 16 2.500z';

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
	gear: 'Gear',
	material: 'Material',
	other: 'Other'
};

/** The filter icons (`ItemFilters`), each drawn in a 24-unit box. Slots show some of them too. */
export const FILTER_ICONS: Record<ItemFilter, string> = {
	all: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
	weapon: 'M19.5 3 21 4.5 10 15.5 8.5 14zM8 13l3 3-1.5 1.5-1-1L5 20l-1-1 3.500-3.500-1-1z',
	ammo: 'M12 2c2 1.800 3 4.200 3 7v9H9V9c0-2.800 1-5.200 3-7zM9 19.500h6V22H9z',
	defense: 'M12 3l7 2.500v6c0 4.500-3 7.800-7 9.500-4-1.700-7-5-7-9.500v-6z',
	quick: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
	gear: 'M12 2l2.200 3.300 3.900-.600-.600 3.900L21 12l-3.500 3.400.600 3.900-3.900-.600L12 22l-2.200-3.300-3.900.600.600-3.900L3 12l3.500-3.400-.600-3.900 3.900.600zM12 8.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7z',
	material: 'M3 5h18v4H3zM3 10.500h18v4H3zM3 16h18v4H3z',
	treasure: 'M7 4h10l4 5-9 11L3 9z',
	quest: 'M12 2l2.500 7.500L22 12l-7.500 2.500L12 22l-2.500-7.500L2 12l7.500-2.500z',
	other:
		'M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z'
};

/**
 * The mark in the bottom-left corner of an item's slot: its filter icon, for quest items,
 * treasure, weapons, defense, gear and materials. Other things have none.
 */
export function slotMark(item: string): { icon: string; label: string } | undefined {
	const def = ITEMS[item];
	if (!def) return undefined;
	if (def.quest) return { icon: FILTER_ICONS.quest, label: 'Quest item' };
	if (def.treasure) return { icon: FILTER_ICONS.treasure, label: 'Treasure' };
	if (def.category === 'weapon') return { icon: FILTER_ICONS.weapon, label: 'Weapon' };
	if (def.category === 'defense') return { icon: FILTER_ICONS.defense, label: 'Defense' };
	if (def.category === 'gear') return { icon: FILTER_ICONS.gear, label: 'Gear' };
	if (def.category === 'material') return { icon: FILTER_ICONS.material, label: 'Material' };
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

/** What wears an item, by what its wear is counted in. */
const WEAR_PER: Record<WearUnit, string> = {
	hit: 'With every hit it lands',
	shot: 'With every shot',
	point: 'With every point of a blow it takes',
	use: 'With every use',
	second: 'For as long as it is worn'
};

/** An angle in radians as degrees: "2.0°". */
function degrees(radians: number): string {
	return `${((radians * 180) / Math.PI).toFixed(1)}°`;
}

/** Seconds, to a tenth: "0.5 s". */
function seconds(value: number): string {
	return `${Number(value.toFixed(2))} s`;
}

/**
 * Every figure of a stack, for the Inspect panel and the store's details: only those that apply
 * to it (damage, spread, time between shots, reload, range, noise, wear per use...). `forSale` is a
 * stack in the store, not one you own: what it holds and stacks to, not what is in it now.
 */
export function itemStats(stack: ItemStack, forSale = false): ItemStat[] {
	const def = ITEMS[stack.item];
	if (!def) return [];
	const stats: ItemStat[] = [];
	const add = (label: string, value: string, coins = false) => stats.push({ label, value, coins });
	if (def.firearm) {
		const gun = def.firearm;
		add('Damage', gun.pellets > 1 ? `${gun.damage} × ${gun.pellets}` : `${gun.damage}`);
		add('Spread', `${degrees(gun.spread.hip)} hip, ${degrees(gun.spread.aimed)} aimed`);
		add('Between shots', seconds(gun.interval));
		if (forSale) add('Holds', `${gun.magazine}`);
		else add('Loaded', `${stack.loaded ?? 0} / ${gun.magazine}`);
		add('Reload', seconds(gun.reloadTime));
		add('Range', `${gun.range} m, ${Math.round(gun.falloff * 100)}% less by then`);
		add('Heard', gun.noise > 0 && !def.silent ? `${gun.noise} m` : 'Silent');
		const rounds = [gun.ammo, ...(gun.alsoFires ?? [])].map((id) => ITEMS[id]?.name ?? id);
		add('Takes', rounds.join(' or '));
		if (gun.single) add('Loads', 'One round at a time');
		if (gun.pierce) add('Shot', 'Passes through everything in its line');
		if (gun.projectile) add('Flight', `${gun.projectile.speed} m/s, falling as it goes`);
	}
	if (def.melee) {
		const melee = def.melee;
		add('Damage', `${melee.damage}`);
		add('Reach', `${melee.range} m`);
		add('Swing', `${seconds(melee.windup)} to land, ${seconds(melee.recovery)} to recover`);
		add('Heard', `${melee.noise} m`);
		if (melee.stamina) add('Stamina', `${melee.stamina} a swing`);
		if (melee.sweep) add('Sweep', 'Hits everything in its arc');
		if (melee.bleed)
			add('Bleeding', `${melee.bleed.dps} a second for ${seconds(melee.bleed.seconds)}`);
		if (melee.snag) add('Snags', `${Math.round(melee.snag.chance * 100)}% of hits`);
		if (melee.stagger) add('Staggers', seconds(melee.stagger));
	}
	if (def.cramped)
		add('Works', def.downed ? 'Crawling, squeezed and downed' : 'Crawling and squeezed');
	if (def.noSprint) add('In the hand', 'No sprinting');
	if (def.cuts?.includes('web')) add('Cuts', 'Webs, in one');
	if (def.breaks?.includes('rubble')) add('Breaks', 'Rubble walls');
	if (def.smash) add('Smashes', 'Trunks and boxes open');
	if (def.picks) add('Picks', 'Locks, silently');
	if (def.pry) add('Pries', 'Jammed lids, false walls');
	if (def.throwable) {
		const t = def.throwable;
		if (t.damage > 0) add('Thrown', `${t.damage} damage`);
		add('Lands', `heard ${t.landNoise} m`);
		if (t.fuse) add('Fuse', `${seconds(t.fuse.seconds)}, then heard ${t.fuse.noise} m`);
		if (t.fire) add('Fire', `${t.fire.dps} a second for ${seconds(t.fire.seconds)}`);
		if (t.glow) add('Glows', `${Math.round(t.glow.seconds / 60)} min, ${t.glow.range} m`);
		if (t.lure) add('Draws', `${t.lure.creature}s within ${t.lure.radius} m`);
	}
	if (def.place) {
		const p = def.place;
		if (p.snare) add('Holds', `The first creature through, ${seconds(p.snare.hold)}`);
		if (p.ward) add('A line', `Not crossed for ${seconds(p.ward.seconds)}`);
		if (p.tripwire) add('Rings', `Heard ${p.tripwire.noise} m when crossed`);
		if (p.anchor) add('Anchor', 'A rope can be tied where it goes in');
	}
	if (def.dose) {
		const cond = CONDITIONS[def.dose.condition];
		add('Takes', `${cond.name}, ${seconds(cond.seconds)}`);
	}
	if (def.whistle) add('Heard', `${def.whistle.noise} m; shows the party where`);
	if (def.censer) add('Keeps off', `${def.censer.repels.join(', ')}s, ${def.censer.radius} m`);
	if (def.protects?.length) add('Keeps off', 'Bites and poison');
	if (def.crawl) add('Crawling', `${Math.round((def.crawl.speed - 1) * 100)}% faster, quieter`);
	if (def.steps) add('Footsteps', `${Math.round((1 - def.steps.quiet) * 100)}% quieter`);
	if (def.climb) add('Climbing', `${Math.round((def.climb - 1) * 100)}% faster`);
	if (def.sprint) add('Sprinting', `${Math.round((1 - def.sprint) * 100)}% slower`);
	if (def.compass) add('Bearing', 'To the nearest way out');
	if (def.crafting) add('Crafting', 'Lets you craft below');
	if (def.fragile) add('Fragile', 'Breaks in a hard fall');
	if (def.cursed) add('Cursed', `${def.cursed.sanity} sanity a second while carried`);
	if (def.spoils) add('Keeps', 'One run');
	if (def.countsAs)
		add(
			'The rite',
			`Counts as ${def.countsAs.count} ${ITEMS[def.countsAs.item]?.name.toLowerCase() ?? ''}s`
		);
	if (def.tarot) add('Draw', 'A card at the start of a run');
	if (def.heal) {
		add('Restores', `${def.heal.amount} sanity`);
		add('Takes', `${def.heal.seconds} s, standing still`);
	}
	if (def.charge) {
		add('Charges', `${def.charge.volts}V into the headlamp`);
		add('Takes', `${def.charge.seconds} s, standing still`);
	}
	if (def.revive) add('Use', 'Revives the downed');
	if (def.rope) {
		add('Rope', `${def.rope.length} m`);
	}
	if (def.defense) add('Shield', `${def.defense.shield}`);
	const last = lasting(def);
	if (last) {
		const left = Math.max(0, last.max - (forSale ? 0 : wearOf(stack)));
		add(last.usedUp ? 'Lasts' : 'Durability', `${wearAmount(left, last.per)} of ${last.max}`);
		add('Wears', WEAR_PER[last.per]);
		if (!last.usedUp) add('When it runs out', 'It breaks, and needs repair');
	}
	add('Weight', stackKilos(stack));
	if (def.maxStack > 1) {
		if (forSale) add('Stacks to', `${def.maxStack}`);
		else add('Stack', `${stack.count} / ${def.maxStack}`);
	}
	// One's price, with the coin sign of the top bar in front; a worn one sells for less.
	const price = sellPrice(stack.item, forSale ? undefined : stack);
	if (!forSale) {
		if (price > 0) add('Sells for', `${price}`, true);
		else if (isBroken(stack) && sellPrice(stack.item) > 0) add('Sells for', 'Nothing, broken');
	}
	return stats;
}
