import { afterEach, beforeEach } from 'vitest';
import { AFFLICTIONS, type RiteSpec } from '../../src/lib/content/afflictions.ts';

/**
 * A rite of carried requirements and hints, for testing that machinery (docs/dev/rite.md): the
 * Gloaming's before its rite became Fontaine's last quest (docs/dev/quests.md). No Affliction
 * uses one today, but the engine still supports it.
 */
export const HINTED_RITE: RiteSpec = {
	requirements: [
		{ item: 'candle', count: 5 },
		{ item: 'chalk', count: 1 },
		{ item: 'pendant', count: 1, place: 'altar' }
	],
	room: 'gloaming-chapel',
	seconds: 5,
	clues: [
		{ text: 'Five candles, never four.', reveals: 'candle' },
		{ text: 'A line drawn in chalk.', reveals: 'chalk' },
		{ text: "The pendant lies on the altar, at the angel's feet.", reveals: 'pendant' },
		{ text: 'In the Gloaming Chapel.', reveals: 'room' }
	],
	clueCopies: 3,
	atStart: false
};

/** For the tests in this file: the Gloaming's rite is `spec` (the real one again after each). */
export function useRite(spec: RiteSpec): void {
	const real = AFFLICTIONS.gloaming.rite;
	beforeEach(() => {
		AFFLICTIONS.gloaming.rite = spec;
	});
	afterEach(() => {
		AFFLICTIONS.gloaming.rite = real;
	});
}
