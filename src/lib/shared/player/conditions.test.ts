import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '../../content/player/conditions.ts';
import { MOVEMENT } from '../../content/player/movement.ts';
import { applyCondition, conditionSpeedCap, stepConditions } from './conditions.ts';
import { createPlayerState } from './simulate.ts';

describe('conditions', () => {
	it("poison (a spider's bite) holds you to a crouching pace for a minute", () => {
		const s = createPlayerState([0, 0, 0], 0);
		expect(conditionSpeedCap(s, MOVEMENT)).toBeNull();
		applyCondition(s, 'poisoned');
		expect(CONDITIONS.poisoned.seconds).toBe(60);
		expect(conditionSpeedCap(s, MOVEMENT)).toBe(MOVEMENT.stances.crouch.speed);
		// A hobble on top is slower still.
		applyCondition(s, 'hobble');
		expect(conditionSpeedCap(s, MOVEMENT)).toBe(MOVEMENT.stances.crawl.speed);
		stepConditions(s, 61);
		expect(conditionSpeedCap(s, MOVEMENT)).toBeNull();
	});
});
