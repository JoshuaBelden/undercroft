import { describe, expect, it } from 'vitest';
import { Rng } from './rng.ts';

const draw = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
	it('gives the same sequence for the same seed (server and clients agree)', () => {
		expect(draw(new Rng(1234), 50)).toEqual(draw(new Rng(1234), 50));
	});

	it('gives different sequences for different seeds', () => {
		expect(draw(new Rng(1), 10)).not.toEqual(draw(new Rng(2), 10));
	});

	it('treats seeds as unsigned 32-bit', () => {
		expect(draw(new Rng(-1), 10)).toEqual(draw(new Rng(0xffffffff), 10));
	});

	it('next() stays in [0, 1)', () => {
		for (const v of draw(new Rng(7), 10000)) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('int() is inclusive at both ends and never leaves the range', () => {
		const rng = new Rng(99);
		const seen = new Set<number>();
		for (let i = 0; i < 2000; i++) {
			const v = rng.int(3, 6);
			expect(Number.isInteger(v)).toBe(true);
			expect(v).toBeGreaterThanOrEqual(3);
			expect(v).toBeLessThanOrEqual(6);
			seen.add(v);
		}
		expect([...seen].sort()).toEqual([3, 4, 5, 6]);
	});

	it('weighted() never picks a zero-weight item', () => {
		const rng = new Rng(5);
		const items = [
			{ id: 'a', w: 0 },
			{ id: 'b', w: 1 },
			{ id: 'c', w: 0 },
			{ id: 'd', w: 3 }
		];
		const counts: Record<string, number> = {};
		for (let i = 0; i < 4000; i++) {
			const pick = rng.weighted(items, (item) => item.w).id;
			counts[pick] = (counts[pick] ?? 0) + 1;
		}
		expect(counts.a).toBeUndefined();
		expect(counts.c).toBeUndefined();
		// Roughly 1:3.
		expect(counts.d / counts.b).toBeGreaterThan(2.5);
		expect(counts.d / counts.b).toBeLessThan(3.5);
	});

	it('shuffle() returns a permutation and leaves the input alone', () => {
		const input = [1, 2, 3, 4, 5, 6, 7, 8];
		const out = new Rng(3).shuffle(input);
		expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect([...out].sort((a, b) => a - b)).toEqual(input);
	});
});
