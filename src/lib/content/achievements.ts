import type { RunOutcome } from '../server/store/runs.ts';

/**
 * Achievements (Steam, in the desktop app). The game server decides who earned one and tells
 * them (`achievement` in src/lib/shared/protocol.ts); the desktop app unlocks it on Steam. A
 * browser gets the message and does nothing with it. Each `id` is the achievement's API name, as
 * it is entered in the Steamworks partner site (deploy/steam/achievements.md lists them).
 * See docs/dev/desktop.md#achievements.
 */

export type AchievementTrigger =
	/** A player's expedition ended this way, with at least `minParty` in it (counting them). */
	| { on: 'run'; outcomes: RunOutcome[]; minParty?: number }
	/** The rite was performed while they were in the expedition (alive and not yet out). */
	| { on: 'rite' }
	/** What the rite summoned was banished while they were in the expedition (alive, not yet out). */
	| { on: 'banished' };

export interface AchievementDef {
	/** Steam API name: upper case, digits and _. Never change one that has shipped. */
	id: string;
	name: string;
	description: string;
	trigger: AchievementTrigger;
}

/** Getting out alive with what you carry. (Banishing doesn't end the run: they still have to get out.) */
const OUT_ALIVE: RunOutcome[] = ['extracted'];

export const ACHIEVEMENTS: AchievementDef[] = [
	{
		id: 'FIRST_EXTRACTION',
		name: 'Daylight',
		description: 'Get out of the undercroft alive with what you carried.',
		trigger: { on: 'run', outcomes: OUT_ALIVE }
	},
	{
		id: 'RITE_PERFORMED',
		name: 'The Rite Is Done',
		description: 'Be in the undercroft when the rite is performed.',
		trigger: { on: 'rite' }
	},
	{
		id: 'COOP_EXTRACTION',
		name: 'Nobody Left Behind',
		description: 'Get out alive from an expedition of two or more explorers.',
		trigger: { on: 'run', outcomes: OUT_ALIVE, minParty: 2 }
	},
	{
		id: 'BANISHED',
		name: 'Banished',
		description: 'Be there when a manifestation is banished.',
		trigger: { on: 'banished' }
	}
];

/** The achievements a player earns from an expedition ending for them this way. */
export function achievementsForRun(outcome: RunOutcome, partySize: number): string[] {
	return ACHIEVEMENTS.filter(
		({ trigger }) =>
			trigger.on === 'run' &&
			trigger.outcomes.includes(outcome) &&
			partySize >= (trigger.minParty ?? 1)
	).map(({ id }) => id);
}

/** The achievements everyone in the expedition earns when the rite is performed. */
export function achievementsForRite(): string[] {
	return ACHIEVEMENTS.filter(({ trigger }) => trigger.on === 'rite').map(({ id }) => id);
}

/** The achievements everyone in the expedition earns when what the rite summoned is banished. */
export function achievementsForBanishing(): string[] {
	return ACHIEVEMENTS.filter(({ trigger }) => trigger.on === 'banished').map(({ id }) => id);
}
