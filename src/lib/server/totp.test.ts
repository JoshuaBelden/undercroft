import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyCode } from './totp.ts';

// A fixed secret and clock, so the real codes are fixed too (none of them is 000000).
const SECRET = 'JBSWY3DPEHPK3PXP';

describe('verifyCode dev code', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	it('accepts all zeros only when the dev code is on', () => {
		expect(verifyCode(SECRET, '000000', -1, true)).not.toBeNull();
		expect(verifyCode(SECRET, '000000', -1, false)).toBeNull();
	});

	it('gives the dev code a step after the used one, so it can be used again', () => {
		const first = verifyCode(SECRET, '000000', -1, true)!;
		expect(verifyCode(SECRET, '000 000', first, true)).toBe(first + 1);
	});

	it('still refuses other wrong codes when the dev code is on', () => {
		expect(verifyCode(SECRET, '00000', -1, true)).toBeNull();
		expect(verifyCode(SECRET, 'abcdef', -1, true)).toBeNull();
	});
});
