import { describe, expect, it } from 'vitest';
import { IMAGE_URLS } from './images.generated.ts';
import { ITEMS, PICTURES } from './items.ts';

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

describe('item pictures', () => {
	it('every item given a picture shows it, wherever it is defined', () => {
		const missing = Object.entries(PICTURES)
			.filter(([id]) => ITEMS[id])
			.filter(([id, picture]) => ITEMS[id].image !== picture && !ITEMS[id].image)
			.map(([id]) => id);
		expect(missing).toEqual([]);
	});

	it('every picture an item names has been built', () => {
		const unbuilt = Object.values(ITEMS)
			.filter((def) => def.image && !IMAGE_URLS[def.image])
			.map((def) => `${def.id}: ${def.image}`);
		expect(unbuilt).toEqual([]);
	});
});
