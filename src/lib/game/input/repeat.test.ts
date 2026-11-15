import { describe, expect, it } from 'vitest';
import { REPEAT_DELAY, REPEAT_EVERY, Repeat, STICK_STEP, stickStep } from './repeat.ts';

describe('stickStep', () => {
	it('is still at rest and on a light push', () => {
		expect(stickStep({ x: 0, y: 0 })).toBe(0);
		expect(stickStep({ x: STICK_STEP - 0.01, y: 0 })).toBe(0);
		expect(stickStep({ x: -(STICK_STEP - 0.01), y: 0 })).toBe(0);
	});

	it('steps the way the stick is pushed, from the threshold on', () => {
		expect(stickStep({ x: STICK_STEP, y: 0 })).toBe(1);
		expect(stickStep({ x: 1, y: 0 })).toBe(1);
		expect(stickStep({ x: -STICK_STEP, y: 0 })).toBe(-1);
		expect(stickStep({ x: -1, y: 0 })).toBe(-1);
	});

	it('leaves a push mostly up or down to scrolling', () => {
		expect(stickStep({ x: 0.7, y: 0.8 })).toBe(0);
		expect(stickStep({ x: -0.7, y: -0.7 })).toBe(0);
		expect(stickStep({ x: 0.8, y: -0.6 })).toBe(1);
		expect(stickStep({ x: -0.8, y: 0.6 })).toBe(-1);
	});

	it('takes another threshold', () => {
		expect(stickStep({ x: 0.3, y: 0 }, 0.25)).toBe(1);
		expect(stickStep({ x: 0.3, y: 0 }, 0.35)).toBe(0);
	});
});

describe('Repeat', () => {
	/** The steps a direction held from `from` to `to` (ms) makes, read every 1 ms. */
	function held(repeat: Repeat, direction: -1 | 1, from: number, to: number): number[] {
		const at: number[] = [];
		for (let now = from; now <= to; now++) {
			if (repeat.next(direction, now) === direction) at.push(now);
		}
		return at;
	}

	it('does nothing while nothing is held', () => {
		const repeat = new Repeat();
		for (let now = 0; now < 2000; now += 16) expect(repeat.next(0, now)).toBe(0);
	});

	it('steps at once, then after the delay at a steady rate', () => {
		const repeat = new Repeat();
		const steps = held(repeat, 1, 0, REPEAT_DELAY + REPEAT_EVERY * 3);
		expect(steps).toEqual([
			0,
			REPEAT_DELAY,
			REPEAT_DELAY + REPEAT_EVERY,
			REPEAT_DELAY + REPEAT_EVERY * 2,
			REPEAT_DELAY + REPEAT_EVERY * 3
		]);
	});

	it('never speeds up, however long it is held', () => {
		const repeat = new Repeat();
		const steps = held(repeat, -1, 0, 10_000).slice(1);
		const gaps = steps.slice(1).map((at, i) => at - (steps[i] ?? 0));
		expect(new Set(gaps)).toEqual(new Set([REPEAT_EVERY]));
	});

	it('starts over once let go', () => {
		const repeat = new Repeat();
		expect(repeat.next(1, 0)).toBe(1);
		expect(repeat.next(1, REPEAT_DELAY - 1)).toBe(0);
		expect(repeat.next(0, REPEAT_DELAY)).toBe(0);
		expect(repeat.next(1, REPEAT_DELAY + 1)).toBe(1);
		// The delay counts again from the new push.
		expect(repeat.next(1, REPEAT_DELAY * 2)).toBe(0);
		expect(repeat.next(1, REPEAT_DELAY * 2 + 1)).toBe(1);
	});

	it('steps at once when turned the other way', () => {
		const repeat = new Repeat();
		expect(repeat.next(1, 0)).toBe(1);
		expect(repeat.next(-1, 50)).toBe(-1);
		expect(repeat.next(-1, 50 + REPEAT_DELAY - 1)).toBe(0);
		expect(repeat.next(-1, 50 + REPEAT_DELAY)).toBe(-1);
	});

	it('steps at once after a reset, even held the same way', () => {
		const repeat = new Repeat();
		expect(repeat.next(1, 0)).toBe(1);
		repeat.reset();
		expect(repeat.next(1, 10)).toBe(1);
		expect(repeat.next(1, 20)).toBe(0);
	});
});
