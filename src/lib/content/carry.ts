/**
 * Carrying: how many slots a pack has and how weight slows you. Shared by the simulation (speed),
 * the server (what fits) and the inventory screens. See docs/dev/items.md.
 */

export interface BackpackDef {
	id: string;
	name: string;
	/** Slots in the pack. */
	slots: number;
	/** Slots across on the inventory screens. */
	columns: number;
	/** Keeps its contents dry when swimming (water arrives in a later phase). */
	waterproof: boolean;
}

export const BACKPACKS: Record<string, BackpackDef> = {
	satchel: { id: 'satchel', name: 'Canvas satchel', slots: 16, columns: 4, waterproof: false }
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
