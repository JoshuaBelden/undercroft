import type { Collection, Db } from 'mongodb';
import { RESPEC_COST, XP, type SkillCategory } from '../../content/progression.ts';
import {
	MAX_RANK,
	pointsSpent,
	progressionOf,
	respec,
	skillById,
	spend,
	SPEND_ERRORS,
	type Progression,
	type SpendError,
	type SpendTarget
} from '../../shared/progression/progression.ts';
import type { ExplorerDoc } from './accounts.ts';
import { EXPLORER_ERRORS, type ExplorerError } from './explorers.ts';
import { log } from './shop.ts';

/**
 * Explorer progression in MongoDB (docs/dev/progression.md): experience the game server adds as
 * runs end, and the points the hub spends. Kept on the explorer as `progression`. Experience is
 * only ever added with `$inc`, so spending (which never touches it) can't lose any.
 */

const explorers = (db: Db): Collection<ExplorerDoc> => db.collection<ExplorerDoc>('explorers');

export type ProgressionError = SpendError | ExplorerError | 'nothing';

/** What to tell the player (read when asked: the game server imports this file too). */
export function progressionError(error: ProgressionError): string {
	if (error === 'nothing') return 'There are no points to put back';
	return error in SPEND_ERRORS
		? SPEND_ERRORS[error as SpendError]
		: EXPLORER_ERRORS[error as ExplorerError];
}

type Result = Promise<{ progression: Progression } | { error: ProgressionError }>;

/**
 * Change the points spent (and coin, for a respec) from the hub: not underground or ready, and
 * only if nothing else changed them meanwhile.
 */
async function changePoints(
	db: Db,
	explorerId: string,
	change: (p: Progression, explorer: ExplorerDoc) => ProgressionError | null
): Result {
	const before = await explorers(db).findOne({ _id: explorerId });
	if (!before) return { error: 'missing' };
	if (before.underground !== null) return { error: 'underground' };
	if (before.ready) return { error: 'ready' };
	const progression = progressionOf(before.progression);
	const after = structuredClone(before);
	const error = change(progression, after);
	if (error) return { error };
	const result = await explorers(db).updateOne(
		{
			_id: explorerId,
			underground: null,
			ready: { $ne: true },
			money: before.money,
			'progression.categories': before.progression?.categories,
			'progression.skills': before.progression?.skills
		},
		{
			$set: {
				money: after.money,
				'progression.categories': progression.categories,
				'progression.skills': progression.skills
			}
		}
	);
	return result.matchedCount === 1 ? { progression } : { error: 'busy' };
}

/** Spend a point: open a category, or a rank of a skill. */
export function spendPoint(db: Db, explorerId: string, target: unknown): Result {
	const parsed = parseTarget(target);
	if (!parsed) return Promise.resolve({ error: 'unknown' });
	return changePoints(db, explorerId, (p) => spend(p, parsed));
}

/** Every point back, for coin. */
export async function respecPoints(db: Db, explorerId: string): Result {
	const result = await changePoints(db, explorerId, (p, explorer) => {
		if (pointsSpent(p) === 0) return 'nothing';
		if (explorer.money < RESPEC_COST) return 'money';
		explorer.money -= RESPEC_COST;
		respec(p);
		return null;
	});
	if ('progression' in result) {
		const explorer = await explorers(db).findOne({ _id: explorerId });
		await log(db, {
			explorer: explorerId,
			kind: 'respec',
			money: -RESPEC_COST,
			balance: explorer?.money ?? 0
		});
	}
	return result;
}

function parseTarget(raw: unknown): SpendTarget | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.category === 'string') return { category: r.category as SkillCategory };
	if (typeof r.skill === 'string') return { skill: r.skill };
	return null;
}

/** The game server: a run is over; what it earned, and the firsts it paid, are kept. */
export async function addExperience(
	db: Db,
	explorerId: string,
	earned: number,
	firsts: string[]
): Promise<void> {
	if (earned <= 0 && firsts.length === 0) return;
	await explorers(db).updateOne(
		{ _id: explorerId },
		{
			$inc: { 'progression.xp': Math.max(0, Math.round(earned)) },
			$addToSet: { 'progression.firsts': { $each: firsts } }
		}
	);
}

/**
 * The Workshop made something: the first time each recipe is made (here or below) pays; any
 * other Workshop craft pays nothing, since the stash makes it safe and unlimited.
 */
export async function workshopCrafted(db: Db, explorerId: string, recipe: string): Promise<void> {
	const first = `recipe:${recipe}`;
	await explorers(db).updateOne(
		{ _id: explorerId, 'progression.firsts': { $ne: first } },
		{ $inc: { 'progression.xp': XP.firstRecipe }, $push: { 'progression.firsts': first } }
	);
}

/** Admin: set the experience (its level follows). */
export async function setExperience(db: Db, explorerId: string, xp: number): Promise<void> {
	await explorers(db).updateOne(
		{ _id: explorerId },
		{ $set: { 'progression.xp': Math.max(0, Math.round(xp)) } }
	);
}

/** Admin: put a skill at a rank (0 clears it), its category opened with it. Points aren't checked. */
export async function setRank(
	db: Db,
	explorerId: string,
	skillId: string,
	rank: number
): Promise<boolean> {
	const skill = skillById(skillId);
	if (!skill) return false;
	const r = Math.max(0, Math.min(MAX_RANK, Math.floor(rank)));
	await explorers(db).updateOne(
		{ _id: explorerId },
		r === 0
			? { $unset: { [`progression.skills.${skill.id}`]: '' } }
			: {
					$set: { [`progression.skills.${skill.id}`]: r },
					$addToSet: { 'progression.categories': skill.category }
				}
	);
	return true;
}

/** Admin: back to nothing earned: no experience, no points spent, no firsts paid. */
export async function resetProgression(db: Db, explorerId: string): Promise<void> {
	await explorers(db).updateOne({ _id: explorerId }, { $unset: { progression: '' } });
}
