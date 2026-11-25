import { DOORS, GATES } from '../../content/doors.ts';
import { ITEMS, type ItemDef } from '../../content/items.ts';
import {
	LOOTABLES,
	type LootableDef,
	type LootableId,
	type LootTool,
	type OpenWay
} from '../../content/lootables.ts';
import type { Inventory, ItemStack } from '../player/types.ts';
import type { Vec3 } from '../map/types.ts';
import { works } from './durability.ts';
import { allStacks, held } from './inventory.ts';

/**
 * Lootable rules, shared by the server (what opening one takes) and the client (the prompt says
 * exactly what the server will do). See docs/dev/lootables.md.
 */

/** What a placement is (a crate when it says nothing). */
export function lootableOf(placement: { kind?: LootableId }): LootableDef {
	return LOOTABLES[placement.kind ?? 'crate'];
}

/** Whether an item is this tool, for this lootable (a blade cuts what its `cuts` names). */
export function hasTool(def: ItemDef | undefined, tool: LootTool, lootable: LootableId): boolean {
	if (!def) return false;
	switch (tool) {
		case 'pry':
			return !!def.pry;
		case 'cut':
			return !!def.cuts?.includes(lootable);
		case 'picks':
			return !!def.picks;
		case 'smash':
			return !!def.smash;
	}
}

/** How it opens now: the ways for a sealed one, or the usual ones. */
export function waysFor(def: LootableDef, sealed: boolean): OpenWay[] {
	return sealed && def.sealed ? def.sealed.open : def.open;
}

/**
 * Whether a player carrying this could open it this way right now, with `helpers` other players
 * at it too (a way that takes two needs one).
 */
export function canUse(way: OpenWay, inv: Inventory, lootable: LootableId, helpers = 0): boolean {
	if (way.together && helpers + 1 < way.together) return false;
	if (way.key) return allStacks(inv).some((stack) => ITEMS[stack.item]?.unlocks);
	if (!way.tool) return true;
	const stack = held(inv);
	return works(stack) && hasTool(ITEMS[stack.item], way.tool, lootable);
}

/**
 * The way this player opens it: the fastest of those they can use (a key before anything), or
 * null if they can use none of them.
 */
export function bestWay(
	ways: OpenWay[],
	inv: Inventory,
	lootable: LootableId,
	helpers = 0
): OpenWay | null {
	let best: OpenWay | null = null;
	for (const way of ways) {
		if (!canUse(way, inv, lootable, helpers)) continue;
		if (!best || way.seconds < best.seconds) best = way;
	}
	return best;
}

/** What it takes, for a prompt that can't be done: "a crowbar", "a key". */
export function wayNeeds(way: OpenWay): string {
	if (way.together) return 'someone to help';
	if (way.key) return 'a key';
	switch (way.tool) {
		case 'pry':
			return 'a crowbar';
		case 'cut':
			return 'a blade';
		case 'picks':
			return 'lockpicks';
		case 'smash':
			return 'a sledgehammer';
		default:
			return '';
	}
}

/**
 * Whether anything in the game can open it at all (sealed or not): every way it has needs a tool
 * no item is yet (lockpicks, a sledgehammer) when not. Maps leave those out until there is one.
 */
export function openable(def: LootableDef): boolean {
	// Filled from, not opened: there as soon as what it fills is (a font, a glass bottle).
	if (def.fill) return !!ITEMS[def.fill.needs] && !!ITEMS[def.fill.makes];
	const any = (ways: OpenWay[]): boolean =>
		ways.some(
			(way) =>
				way.key ||
				way.together ||
				!way.tool ||
				Object.values(ITEMS).some((item) => hasTool(item, way.tool!, def.id))
		);
	return any(def.open) && (!def.sealed || any(def.sealed.open));
}

/** The key a lock takes: an ordinary key before anything that is treasure too (a key ring). */
export function firstKey(inv: Inventory): ItemStack | null {
	const keys = allStacks(inv).filter((stack) => ITEMS[stack.item]?.unlocks);
	return keys.find((stack) => !ITEMS[stack.item]?.treasure) ?? keys[0] ?? null;
}

/** The middle of a lootable: what is looked at to open it. */
export function lootableCentre(placement: { position: Vec3; kind?: LootableId }): Vec3 {
	const def = lootableOf(placement);
	const height = def.lookHeight ?? def.size[1] / 2;
	const [x, y, z] = placement.position;
	return [x, y + height, z];
}

/** A flavor line for a lootable, picked by its id so everyone sees the same one. */
export function flavorOf(def: LootableDef, id: string): string {
	let hash = 0;
	for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
	return def.flavor[Math.abs(hash) % def.flavor.length] ?? '';
}

/**
 * Seconds a door takes to open with what is carried, or null if it won't open for them: a locked
 * door (`key`) only with that item, a gate with any key or lockpicks, any other door by hand.
 */
export function doorSeconds(door: { kind?: 'gate'; key?: string }, inv: Inventory): number | null {
	if (door.key)
		return allStacks(inv).some((stack) => stack.item === door.key) ? GATES.keySeconds : null;
	if (door.kind === 'gate') return gateSeconds(inv);
	return DOORS.openSeconds;
}

/** Seconds a gate takes with what is carried: a key (fast), lockpicks in the hand, or null. */
export function gateSeconds(inv: Inventory): number | null {
	if (allStacks(inv).some((stack) => ITEMS[stack.item]?.unlocks)) return GATES.keySeconds;
	const stack = held(inv);
	if (works(stack) && ITEMS[stack.item]?.picks) return GATES.picksSeconds;
	return null;
}
