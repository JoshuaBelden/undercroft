import { describe, expect, it } from 'vitest';
import { HOLD_TIME, Hold } from './hold.ts';

describe('Hold', () => {
	it('fills from the press to the hold time', () => {
		const hold = new Hold(1000);
		expect(hold.progress(1000)).toBe(0);
		expect(hold.progress(1000 + HOLD_TIME / 2)).toBeCloseTo(0.5);
		expect(hold.progress(1000 + HOLD_TIME * 2)).toBe(1);
		// A frame stamped a little before the press doesn't go below empty.
		expect(hold.progress(990)).toBe(0);
	});

	it('completes once, on the first frame at or past the hold time', () => {
		const hold = new Hold(0, 600);
		expect(hold.update(300)).toBe(false);
		expect(hold.update(599)).toBe(false);
		expect(hold.update(600)).toBe(true);
		expect(hold.done).toBe(true);
		expect(hold.update(700)).toBe(false);
		expect(hold.progress(700)).toBe(1);
	});

	it('is a quick press when let go before it completes', () => {
		const hold = new Hold(0, 600);
		hold.update(200);
		expect(hold.release()).toBe(true);
	});

	it('does nothing more when let go after it completed', () => {
		const hold = new Hold(0, 600);
		hold.update(650);
		expect(hold.release()).toBe(false);
	});

	it('empties and does nothing when cancelled', () => {
		const hold = new Hold(0, 600);
		hold.update(300);
		hold.cancel();
		expect(hold.progress(400)).toBe(0);
		expect(hold.update(900)).toBe(false);
		expect(hold.release()).toBe(false);
	});

	it('stays done when cancelled after completing', () => {
		const hold = new Hold(0, 600);
		hold.update(600);
		hold.cancel();
		expect(hold.cancelled).toBe(false);
		expect(hold.progress(700)).toBe(1);
	});
});
