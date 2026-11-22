import {
	LEVELS,
	SKILLS,
	SKILL_CATEGORIES,
	type ModifierKey,
	type SkillCategory,
	type SkillDef
} from '../../content/progression.ts';

/**
 * Explorer levels and the skill tree (docs/dev/progression.md): the rules both the site (spending
 * points) and the game server (what a skill does) go by.
 */

/** What an explorer has earned and spent, kept on their explorer. */
export interface Progression {
	/** Experience, in all. */
	xp: number;
	/** Categories opened (a point each). */
	categories: SkillCategory[];
	/** Rank (1..3) of each skill with any. */
	skills: Record<string, number>;
	/**
	 * Firsts already paid (`loot:crate`, `recipe:bandage`, `kill:witch`, `hint:gloaming:2`,
	 * `rite:gloaming`, `extract:1`): each pays once, ever.
	 */
	firsts: string[];
}

export function emptyProgression(): Progression {
	return { xp: 0, categories: [], skills: {}, firsts: [] };
}

/** Read a stored progression, filling what is missing (explorers from before it existed). */
export function progressionOf(raw: Partial<Progression> | null | undefined): Progression {
	return {
		xp: Math.max(0, Math.floor(raw?.xp ?? 0)),
		categories: (raw?.categories ?? []).filter((c) => SKILL_CATEGORIES.some((k) => k.id === c)),
		skills: Object.fromEntries(
			Object.entries(raw?.skills ?? {}).filter(([id, rank]) => skillById(id) && rank > 0)
		),
		firsts: [...(raw?.firsts ?? [])]
	};
}

export function skillById(id: string): SkillDef | undefined {
	return SKILLS.find((s) => s.id === id);
}

export function levelOf(xp: number): number {
	return Math.min(LEVELS.max, Math.floor(Math.max(0, xp) / LEVELS.xpPerLevel));
}

/** How far into the current level: 0..1 (1 at the cap). */
export function levelProgress(xp: number): number {
	if (levelOf(xp) >= LEVELS.max) return 1;
	return (Math.max(0, xp) % LEVELS.xpPerLevel) / LEVELS.xpPerLevel;
}

/** One a level. */
export function pointsEarned(p: Progression): number {
	return levelOf(p.xp);
}

export function pointsSpent(p: Progression): number {
	return p.categories.length + Object.values(p.skills).reduce((sum, rank) => sum + rank, 0);
}

export function pointsLeft(p: Progression): number {
	return Math.max(0, pointsEarned(p) - pointsSpent(p));
}

export const MAX_RANK = 3;

/** What can be spent on: a category to open, or a skill to rank up. */
export type SpendTarget = { category: SkillCategory } | { skill: string };

export type SpendError = 'points' | 'locked' | 'maxed' | 'unknown';

export const SPEND_ERRORS: Record<SpendError, string> = {
	points: 'No points to spend',
	locked: 'Open its category first',
	maxed: 'Already at the top rank',
	unknown: 'No such skill'
};

/** Whether a point can go there, and if not why. */
export function canSpend(p: Progression, target: SpendTarget): SpendError | null {
	if ('category' in target) {
		if (!SKILL_CATEGORIES.some((c) => c.id === target.category)) return 'unknown';
		if (p.categories.includes(target.category)) return 'maxed';
	} else {
		const skill = skillById(target.skill);
		if (!skill) return 'unknown';
		if (!p.categories.includes(skill.category)) return 'locked';
		if ((p.skills[skill.id] ?? 0) >= MAX_RANK) return 'maxed';
	}
	return pointsLeft(p) > 0 ? null : 'points';
}

/** Spend a point there (checked first). Returns the error, or null and `p` changed. */
export function spend(p: Progression, target: SpendTarget): SpendError | null {
	const error = canSpend(p, target);
	if (error) return error;
	if ('category' in target) p.categories.push(target.category);
	else p.skills[target.skill] = (p.skills[target.skill] ?? 0) + 1;
	return null;
}

/** Every point back: categories and skills cleared, experience and firsts kept. */
export function respec(p: Progression): void {
	p.categories = [];
	p.skills = {};
}

/**
 * What an explorer's skills change, as multipliers on game values (1 changes nothing) and a
 * chance (`scrounge`). On `PlayerState.mods`, so the client's prediction agrees with the server.
 */
export type Modifiers = Record<ModifierKey, number>;

export function noModifiers(): Modifiers {
	return {
		batteryDrain: 1,
		darkDrain: 1,
		moveNoise: 1,
		darkSpotted: 1,
		melee: 1,
		spread: 1,
		blowSanity: 1,
		healTime: 1,
		craftTime: 1,
		craftNoise: 1,
		wear: 1,
		openTime: 1,
		openNoise: 1,
		scrounge: 0
	};
}

/** The bonus a skill gives at a rank (0 at none). */
export function bonusAt(skill: SkillDef, rank: number): number {
	return rank <= 0 ? 0 : skill.ranks[Math.min(MAX_RANK, rank) - 1];
}

export function modifiersFor(skills: Record<string, number>): Modifiers {
	const mods = noModifiers();
	for (const [id, rank] of Object.entries(skills)) {
		const skill = skillById(id);
		if (!skill) continue;
		const bonus = bonusAt(skill, rank);
		for (const { key, how } of skill.effects) {
			if (how === 'less') mods[key] *= 1 - bonus;
			else if (how === 'more') mods[key] *= 1 + bonus;
			else mods[key] = Math.max(mods[key], bonus);
		}
	}
	return mods;
}

/** How a skill reads at a rank: the summary at that rank's bonus. */
export function summaryAt(skill: SkillDef, rank: number): string {
	const bonus = bonusAt(skill, Math.max(1, rank));
	return skill.summary.replace('{n}', `${Math.round(bonus * 100)}%`);
}
