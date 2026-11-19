import { CONDITIONS, isConditionId, type ConditionId } from '../../content/player/conditions.ts';
import type { MovementTuning } from '../../content/player/movement.ts';
import type { PlayerState } from './types.ts';

/**
 * Conditions on a player (CONDITIONS): applying them, counting them down, and what they do to
 * movement. Part of the player simulation. See docs/dev/player.md#conditions.
 */

/**
 * Give the player a condition for its full time, or for seconds when what caused it says how
 * long (again from the start if they have it, unless they already have longer left).
 */
export function applyCondition(
	s: PlayerState,
	id: ConditionId,
	seconds: number = CONDITIONS[id].seconds
): void {
	const active = s.conditions.find((c) => c.id === id);
	if (active) active.remaining = Math.max(active.remaining, seconds);
	else s.conditions.push({ id, remaining: seconds });
}

export function hasCondition(s: PlayerState, id: ConditionId): boolean {
	return s.conditions.some((c) => c.id === id);
}

/** Count every condition down; drop the ones that have run out. */
export function stepConditions(s: PlayerState, dt: number): void {
	if (s.conditions.length === 0) return;
	for (const c of s.conditions) c.remaining -= dt;
	s.conditions = s.conditions.filter((c) => c.remaining > 0);
}

/** A condition is keeping the headlamp off (dark). */
export function lampBlocked(s: PlayerState): boolean {
	return s.conditions.some((c) => isConditionId(c.id) && 'dark' in CONDITIONS[c.id]);
}

/** The lowest speed cap the player's conditions put on them (m/s), or null for none. */
export function conditionSpeedCap(s: PlayerState, t: MovementTuning): number | null {
	let cap: number | null = null;
	for (const c of s.conditions) {
		if (!isConditionId(c.id)) continue;
		const def = CONDITIONS[c.id];
		const slow = 'slow' in def ? def.slow : undefined;
		if (!slow) continue;
		const speed = t.stances[slow].speed;
		cap = cap === null ? speed : Math.min(cap, speed);
	}
	return cap;
}
