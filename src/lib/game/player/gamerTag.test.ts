import { describe, expect, it } from 'vitest';
import { GAMER_TAGS } from '#lib/content/player/gamerTags.ts';
import { tagOpacity } from './gamerTag.ts';

describe('tagOpacity', () => {
	it('is whole up close and gone far away', () => {
		expect(tagOpacity(0, 8, 20)).toBe(1);
		expect(tagOpacity(8, 8, 20)).toBe(1);
		expect(tagOpacity(20, 8, 20)).toBe(0);
		expect(tagOpacity(50, 8, 20)).toBe(0);
	});

	it('fades smoothly between, halfway at the middle', () => {
		expect(tagOpacity(14, 8, 20)).toBeCloseTo(0.5);
		let last = 1;
		for (let d = 8; d <= 20; d += 0.5) {
			const opacity = tagOpacity(d, 8, 20);
			expect(opacity).toBeLessThanOrEqual(last);
			last = opacity;
		}
	});

	it('the tuning fades out before the far end of a long passage', () => {
		expect(GAMER_TAGS.fullUntil).toBeLessThan(GAMER_TAGS.goneAt);
		expect(tagOpacity(GAMER_TAGS.goneAt, GAMER_TAGS.fullUntil, GAMER_TAGS.goneAt)).toBe(0);
	});
});
