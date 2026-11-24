import { describe, expect, it } from 'vitest';
import { MODELS } from '../models.generated.ts';
import { bodyPaths, wearPath } from './model.ts';
import {
	BODIES,
	BOOTS_HIDE_BIT,
	TINTS,
	WEAR,
	WEAR_SLOTS,
	type BodyId,
	type WearId
} from './wardrobe.ts';

const bodies = Object.keys(BODIES) as BodyId[];
const pieces = Object.keys(WEAR) as WearId[];

describe('the wardrobe', () => {
	it('has every body’s mesh, clips and pieces built', () => {
		for (const body of bodies) {
			const paths = bodyPaths(body);
			expect(MODELS, paths.body).toHaveProperty([paths.body]);
			expect(MODELS, paths.anims).toHaveProperty([paths.anims]);
			for (const id of pieces)
				expect(MODELS, wearPath(body, id)).toHaveProperty([wearPath(body, id)]);
		}
	});

	it('gives each piece its own hide bit, clear of the boots’, within a float’s exact range', () => {
		const bits = pieces.map((id) => WEAR[id].hideBit);
		expect(new Set(bits).size).toBe(bits.length);
		expect(bits).not.toContain(BOOTS_HIDE_BIT);
		for (const bit of bits) expect(bit).toBeLessThan(24);
	});

	it('has a piece for every required slot, and a palette per tintable part', () => {
		for (const slot of WEAR_SLOTS.filter((s) => s !== 'jacket')) {
			expect(pieces.some((id) => WEAR[id].slot === slot)).toBe(true);
		}
		for (const palette of Object.values(TINTS)) {
			expect(new Set(palette.map((s) => s.id)).size).toBe(palette.length);
		}
	});
});
