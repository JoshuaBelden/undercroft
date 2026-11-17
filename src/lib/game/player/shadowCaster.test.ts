import { describe, expect, it } from 'vitest';
import { pickShadowCaster } from './shadowCaster.ts';

const lamp = (id: string, distance: number, lit = true) => ({ id, distance, lit });

describe('pickShadowCaster', () => {
	it('picks the nearest lit lamp', () => {
		expect(pickShadowCaster([lamp('a', 6), lamp('b', 3), lamp('c', 1, false)], null, 1.5)).toBe(
			'b'
		);
	});

	it('keeps the current one until another is closer by the margin', () => {
		expect(pickShadowCaster([lamp('a', 4), lamp('b', 3)], 'a', 1.5)).toBe('a');
		expect(pickShadowCaster([lamp('a', 5), lamp('b', 3)], 'a', 1.5)).toBe('b');
	});

	it('lets go of a lamp that went out or left', () => {
		expect(pickShadowCaster([lamp('a', 1, false), lamp('b', 8)], 'a', 1.5)).toBe('b');
		expect(pickShadowCaster([lamp('b', 8)], 'gone', 1.5)).toBe('b');
	});

	it('still picks someone when no lamp is lit (the shadow-light count never changes)', () => {
		expect(pickShadowCaster([lamp('a', 1, false), lamp('b', 4, false)], 'b', 1.5)).toBe('b');
		expect(pickShadowCaster([lamp('a', 1, false), lamp('b', 4, false)], null, 1.5)).toBe('a');
	});

	it('is nobody with nobody there', () => {
		expect(pickShadowCaster([], 'a', 1.5)).toBeNull();
	});
});
