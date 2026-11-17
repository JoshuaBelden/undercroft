import type { Stance } from '../../shared/player/types.ts';

/**
 * Conditions: something wrong with an explorer for a while (a hobble after a fall). Data only;
 * the simulation applies their effects and counts them down (`src/lib/shared/player/conditions.ts`)
 * and the HUD shows them beside the health bar. See docs/dev/player.md#conditions.
 */
export interface ConditionDef {
	id: string;
	/** Shown on the HUD chip and in help. */
	name: string;
	/** How long it lasts (s). Getting it again while it lasts starts it over. */
	seconds: number;
	/** One line for the HUD tooltip and help. */
	description: string;
	/** No faster than this stance's walking speed, whatever the stance; and no sprinting. */
	slow?: Stance;
}

export const CONDITIONS = {
	hobble: {
		id: 'hobble',
		name: 'Hobbled',
		seconds: 20,
		description: 'A bad fall: no faster than a crawl, and no running, until it wears off.',
		slow: 'crawl'
	}
} as const satisfies Record<string, ConditionDef>;

export type ConditionId = keyof typeof CONDITIONS;

export function isConditionId(id: string): id is ConditionId {
	return Object.hasOwn(CONDITIONS, id);
}
