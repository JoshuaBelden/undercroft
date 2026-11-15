import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MARK_WHEEL,
	MARK_SYMBOLS,
	MARK_WHEEL_SIZE,
	cleanMarkWheel,
	markWheel
} from './marks.ts';

describe('chalk symbols', () => {
	it('every symbol is filed under its own id, with a name and strokes inside the square', () => {
		for (const [key, symbol] of Object.entries(MARK_SYMBOLS)) {
			expect(symbol.id).toBe(key);
			expect(symbol.name.length).toBeGreaterThan(0);
			expect(symbol.strokes.length).toBeGreaterThan(0);
			for (const [x, y] of symbol.strokes.flat()) {
				expect(x).toBeGreaterThanOrEqual(0);
				expect(x).toBeLessThanOrEqual(1);
				expect(y).toBeGreaterThanOrEqual(0);
				expect(y).toBeLessThanOrEqual(1);
			}
		}
	});

	it('there are more symbols than fit on a wheel, and the default wheel is a valid one', () => {
		expect(Object.keys(MARK_SYMBOLS).length).toBeGreaterThan(MARK_WHEEL_SIZE);
		expect(cleanMarkWheel([...DEFAULT_MARK_WHEEL])).toEqual([...DEFAULT_MARK_WHEEL]);
	});
});

describe('cleanMarkWheel', () => {
	const custom = ['loot', 'trap', 'water', 'exit', 'stairs', 'wait', 'meet', 'help'];

	it('takes eight known, distinct symbols, in order', () => {
		expect(cleanMarkWheel(custom)).toEqual(custom);
	});

	it('refuses the wrong count, unknown ids, repeats and anything not a list of strings', () => {
		expect(cleanMarkWheel(custom.slice(0, 7))).toBeNull();
		expect(cleanMarkWheel([...custom, 'up'])).toBeNull();
		expect(cleanMarkWheel([...custom.slice(0, 7), 'no-such-symbol'])).toBeNull();
		expect(cleanMarkWheel([...custom.slice(0, 7), 'loot'])).toBeNull();
		expect(cleanMarkWheel([...custom.slice(0, 7), 'toString'])).toBeNull();
		expect(cleanMarkWheel([...custom.slice(0, 7), 3])).toBeNull();
		expect(cleanMarkWheel('loot')).toBeNull();
		expect(cleanMarkWheel(null)).toBeNull();
	});
});

describe('markWheel', () => {
	it('is the saved wheel, or the default when none was saved or it no longer checks out', () => {
		const custom = ['loot', 'trap', 'water', 'exit', 'stairs', 'wait', 'meet', 'help'];
		expect(markWheel(custom)).toEqual(custom);
		expect(markWheel(undefined)).toEqual(DEFAULT_MARK_WHEEL);
		expect(markWheel(['loot'])).toEqual(DEFAULT_MARK_WHEEL);
	});
});
