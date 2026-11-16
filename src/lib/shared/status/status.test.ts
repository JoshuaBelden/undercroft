import { describe, expect, it } from 'vitest';
import { applyStatus, endStatus, hasStatus, stepStatuses, type Statuses } from './status.ts';

const REACTIONS = { stunned: { seconds: 2, immunity: 20 } };

describe('statuses', () => {
	it('a status lasts as long as the creature takes it, then it is immune for a while', () => {
		const s: Statuses = {};
		expect(applyStatus(s, 'stunned', REACTIONS)).toBe(true);
		expect(hasStatus(s, 'stunned')).toBe(true);
		// Not again while it has it.
		expect(applyStatus(s, 'stunned', REACTIONS)).toBe(false);
		stepStatuses(s, REACTIONS, 1.5);
		expect(hasStatus(s, 'stunned')).toBe(true);
		stepStatuses(s, REACTIONS, 0.6);
		expect(hasStatus(s, 'stunned')).toBe(false);
		// Immune for 20 s after it ends.
		stepStatuses(s, REACTIONS, 19);
		expect(applyStatus(s, 'stunned', REACTIONS)).toBe(false);
		stepStatuses(s, REACTIONS, 1.1);
		expect(s).toEqual({});
		expect(applyStatus(s, 'stunned', REACTIONS)).toBe(true);
	});

	it('a creature with no reaction to a status never gets it', () => {
		const s: Statuses = {};
		expect(applyStatus(s, 'stunned', {})).toBe(false);
		expect(applyStatus(s, 'stunned', { stunned: { seconds: 0, immunity: 5 } })).toBe(false);
		expect(hasStatus(s, 'stunned')).toBe(false);
	});

	it('ending a status early still leaves its immunity', () => {
		const s: Statuses = {};
		applyStatus(s, 'stunned', REACTIONS);
		endStatus(s, 'stunned', REACTIONS);
		expect(hasStatus(s, 'stunned')).toBe(false);
		expect(applyStatus(s, 'stunned', REACTIONS)).toBe(false);
		endStatus(s, 'stunned', REACTIONS);
		const none: Statuses = {};
		applyStatus(none, 'stunned', { stunned: { seconds: 1, immunity: 0 } });
		endStatus(none, 'stunned', { stunned: { seconds: 1, immunity: 0 } });
		expect(none).toEqual({});
	});
});
