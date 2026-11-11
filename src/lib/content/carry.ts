/**
 * Carrying: how much a pack holds and how weight slows you. Shared by the simulation (speed),
 * the server (what fits) and the inventory screen. See docs/dev/items.md.
 */

export interface BackpackDef {
	id: string;
	name: string;
	/** Bulk units the pack holds (each item has a `bulk`). */
	capacity: number;
	/** Keeps its contents dry when swimming (water arrives in a later phase). */
	waterproof: boolean;
}

export const BACKPACKS: Record<string, BackpackDef> = {
	satchel: { id: 'satchel', name: 'Canvas satchel', capacity: 12, waterproof: false }
};

/** The pack every player has until the hub sells better ones. */
export const DEFAULT_BACKPACK = 'satchel';

export const CARRY = {
	/** Up to this weight (kg) you move at full speed. */
	comfortable: 12,
	/** You can't pick up anything that would take you past this weight (kg). */
	max: 30,
	/** Speed multiplier at the maximum weight; it falls evenly from 1 between the two. */
	slowest: 0.6
};
