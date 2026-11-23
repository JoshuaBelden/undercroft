import { describe, expect, it } from 'vitest';
import { greet, greetingDue } from './greetings.ts';

describe('contact greetings', () => {
	it('is due the first time, then not until `every` seconds have passed', () => {
		expect(greetingDue(undefined, 210, 1000)).toBe(true);
		expect(greetingDue(1000, 210, 1000 + 209_000)).toBe(false);
		expect(greetingDue(1000, 210, 1000 + 210_000)).toBe(true);
		// A clock set back: greet rather than stay silent for ever.
		expect(greetingDue(5000, 210, 1000)).toBe(true);
	});

	it('greets once, then waits, each contact on its own', () => {
		const now = 1_000_000;
		expect(greet('test-a', 210, now)).toBe(true);
		expect(greet('test-a', 210, now + 60_000)).toBe(false);
		expect(greet('test-b', 210, now + 60_000)).toBe(true);
		expect(greet('test-a', 210, now + 210_000)).toBe(true);
	});
});
