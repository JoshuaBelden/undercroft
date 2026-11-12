import type { RiteSpec } from '../../content/afflictions.ts';
import { carriedCount } from '../items/inventory.ts';
import type { Inventory } from '../player/types.ts';
import type { RiteSnapshot } from './types.ts';

/**
 * Rite rules shared by the server (authoritative) and the client (prompt, rite overlay, the
 * Afflictions page). See docs/dev/rite.md.
 */

/** What `clues` found hints reveal: the first `clues` hints, in order, and what they name. */
export function revealed(
	spec: RiteSpec,
	clues: number
): { hints: string[]; slots: boolean[]; room: boolean } {
	const found = spec.clues.slice(0, Math.max(0, clues));
	// Once every hint is found nothing is hidden, even a requirement no hint names.
	const done = clues >= spec.clues.length;
	const named = new Set(found.map((clue) => clue.reveals));
	return {
		hints: found.map((clue) => clue.text),
		slots: spec.requirements.map((r) => done || named.has(r.item)),
		room: done || named.has('room')
	};
}

/** The rite as clients may see it: hidden slots are null. */
export function riteSnapshot(spec: RiteSpec, clues: number, resolved = false): RiteSnapshot {
	const known = revealed(spec, clues);
	return {
		requirements: spec.requirements.map((r, i) =>
			known.slots[i] ? { item: r.item, count: r.count } : null
		),
		room: known.room ? spec.room : null,
		seconds: spec.seconds,
		hints: known.hints,
		resolved
	};
}

/** Whether an inventory holds every (known) requirement. */
export function carriesAll(
	inv: Inventory,
	requirements: readonly ({ item: string; count: number } | null)[]
): boolean {
	return requirements.every((r) => r !== null && carriedCount(inv, r.item) >= r.count);
}
