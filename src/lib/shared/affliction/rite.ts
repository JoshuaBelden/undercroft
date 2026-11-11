import type { RiteSpec } from '../../content/afflictions.ts';
import { carriedCount } from '../items/inventory.ts';
import type { Inventory } from '../player/types.ts';
import type { RiteSnapshot } from './types.ts';

/**
 * Rite rules shared by the server (authoritative) and the client (prompt, rite panel).
 * See docs/dev/rite.md.
 */

/**
 * What `clues` found clues reveal: one requirement slot each, in order. The last clue reveals
 * whatever slots are left, and the room.
 */
export function revealed(spec: RiteSpec, clues: number): { slots: number; room: boolean } {
	const done = clues >= spec.clues;
	return {
		slots: done ? spec.requirements.length : Math.min(spec.requirements.length, clues),
		room: done
	};
}

/** The rite as clients may see it: hidden slots are null. */
export function riteSnapshot(spec: RiteSpec, clues: number): RiteSnapshot {
	const known = revealed(spec, clues);
	return {
		requirements: spec.requirements.map((r, i) => (i < known.slots ? { ...r } : null)),
		room: known.room ? spec.room : null,
		seconds: spec.seconds
	};
}

/** Whether an inventory holds every (known) requirement. */
export function carriesAll(
	inv: Inventory,
	requirements: readonly ({ item: string; count: number } | null)[]
): boolean {
	return requirements.every((r) => r !== null && carriedCount(inv, r.item) >= r.count);
}
