import type { StatusReactions } from '../../content/statuses.ts';

/**
 * Status bookkeeping for one creature: which statuses it has, for how long, and how long it is
 * immune to each after one ends. This only keeps time; what a status does is up to the
 * creature's own code. See docs/dev/status.md.
 */

export interface StatusState {
	/** Seconds the status has left (0 when it doesn't have it). */
	left: number;
	/** Seconds before it can have it again. */
	immune: number;
}

export type Statuses = Record<string, StatusState>;

/**
 * Give it a status, by its own reaction to it. Refused (false) when it has no reaction to it,
 * already has it, or is still immune.
 */
export function applyStatus(statuses: Statuses, id: string, reactions: StatusReactions): boolean {
	const reaction = reactions[id];
	if (!reaction || reaction.seconds <= 0) return false;
	const s = statuses[id];
	if (s && (s.left > 0 || s.immune > 0)) return false;
	statuses[id] = { left: reaction.seconds, immune: 0 };
	return true;
}

/** Advance time: a status that runs out starts its immunity. */
export function stepStatuses(statuses: Statuses, reactions: StatusReactions, dt: number): void {
	for (const [id, s] of Object.entries(statuses)) {
		if (s.left > 0) {
			s.left = Math.max(0, s.left - dt);
			if (s.left === 0) s.immune = reactions[id]?.immunity ?? 0;
		} else if (s.immune > 0) {
			s.immune = Math.max(0, s.immune - dt);
		}
		if (s.left === 0 && s.immune === 0) delete statuses[id];
	}
}

export function hasStatus(statuses: Statuses, id: string): boolean {
	return (statuses[id]?.left ?? 0) > 0;
}

/** End a status now (it still leaves its immunity behind). */
export function endStatus(statuses: Statuses, id: string, reactions: StatusReactions): void {
	const s = statuses[id];
	if (!s || s.left <= 0) return;
	s.left = 0;
	s.immune = reactions[id]?.immunity ?? 0;
	if (s.immune === 0) delete statuses[id];
}
