import { describe, expect, it } from 'vitest';
import { ITEMS } from './items.ts';

describe('item grips', () => {
	it('everything that can be in the hand has one, so other players see it held', () => {
		const handheld = Object.values(ITEMS).filter(
			(def) => def.category === 'weapon' || def.category === 'quick'
		);
		expect(handheld.filter((def) => !def.grip).map((def) => def.id)).toEqual([]);
	});

	it('a firearm held in two hands is the only two-handed thing', () => {
		for (const def of Object.values(ITEMS)) {
			if (def.grip?.pose === 'twoHand') expect(def.firearm).toBeDefined();
		}
	});
});
