import { randomUUID } from 'node:crypto';
import type { Collection, Db } from 'mongodb';

/**
 * Game stats: one line per player per expedition (written by the game server when they leave
 * it), and the game server's status, written every few seconds. The admin app's dashboard reads
 * both; so will the balance pass. Imports by relative path. See docs/dev/admin.md#stats.
 */

/** How a player's expedition ended. */
export type RunOutcome = 'extracted' | 'died' | 'lost' | 'abandoned' | 'banished' | 'left';

export interface RunDoc {
	_id: string;
	explorer: string;
	session: string;
	seed: number;
	version: string;
	affliction: string;
	outcome: RunOutcome;
	/** Time underground. */
	seconds: number;
	deepestLevel: number;
	kills: number;
	crates: number;
	clues: number;
	/** What they brought out is worth this much at the store (0 if they didn't get out). */
	carriedValue: number;
	/** How many players went down in the expedition. */
	partySize: number;
	/** Seconds from the start of the expedition until the Affliction manifested; null if it didn't. */
	manifestedAfter: number | null;
	at: Date;
}

export interface ServerStatusDoc {
	_id: 'game';
	version: string;
	/** Connected players, in a party on the surface or underground. */
	online: number;
	parties: number;
	expeditions: number;
	underground: number;
	startedAt: Date;
	/** Resident memory, MB. */
	memoryMb: number;
	updatedAt: Date;
}

const runs = (db: Db): Collection<RunDoc> => db.collection<RunDoc>('runs');
const status = (db: Db): Collection<ServerStatusDoc> =>
	db.collection<ServerStatusDoc>('serverStatus');

export async function ensureRunIndexes(db: Db): Promise<void> {
	await runs(db).createIndex({ at: -1 });
	await runs(db).createIndex({ explorer: 1, at: -1 });
}

export async function recordRun(db: Db, run: Omit<RunDoc, '_id' | 'at'>): Promise<void> {
	await runs(db).insertOne({ _id: randomUUID(), ...run, at: new Date() });
}

/** The latest runs of these explorers (one account's), newest first. */
export async function runsOf(db: Db, explorers: string[], limit = 25): Promise<RunDoc[]> {
	return runs(db)
		.find({ explorer: { $in: explorers } })
		.sort({ at: -1 })
		.limit(limit)
		.toArray();
}

export async function writeServerStatus(
	db: Db,
	doc: Omit<ServerStatusDoc, '_id' | 'updatedAt'>
): Promise<void> {
	await status(db).updateOne(
		{ _id: 'game' },
		{ $set: { ...doc, updatedAt: new Date() } },
		{ upsert: true }
	);
}

export async function readServerStatus(db: Db): Promise<ServerStatusDoc | null> {
	return status(db).findOne({ _id: 'game' });
}

/** Runs per day, for the last `days` days (UTC dates), with how each ended. */
export interface DayRuns {
	day: string;
	runs: number;
	extracted: number;
	players: number;
}

export interface RunTotals {
	runs: number;
	players: number;
	byOutcome: Record<string, number>;
	avgSeconds: number;
	avgDeepest: number;
	avgKills: number;
	avgCrates: number;
	avgCarried: number;
	/** Of the runs whose Affliction manifested: when, on average (seconds from the start). */
	avgManifestedAfter: number | null;
	solo: number;
	coop: number;
}

/** Everything the dashboard says about runs since `since`. */
export async function runSummary(
	db: Db,
	since: Date
): Promise<{ totals: RunTotals; days: DayRuns[] }> {
	const match = { at: { $gte: since } };
	const [totals] = await runs(db)
		.aggregate<RunTotals & { explorers: string[]; manifested: number }>([
			{ $match: match },
			{
				$group: {
					_id: null,
					runs: { $sum: 1 },
					explorers: { $addToSet: '$explorer' },
					avgSeconds: { $avg: '$seconds' },
					avgDeepest: { $avg: '$deepestLevel' },
					avgKills: { $avg: '$kills' },
					avgCrates: { $avg: '$crates' },
					avgCarried: { $avg: '$carriedValue' },
					avgManifestedAfter: { $avg: '$manifestedAfter' },
					solo: { $sum: { $cond: [{ $eq: ['$partySize', 1] }, 1, 0] } },
					coop: { $sum: { $cond: [{ $gt: ['$partySize', 1] }, 1, 0] } }
				}
			}
		])
		.toArray();
	const outcomes = await runs(db)
		.aggregate<{ _id: string; count: number }>([
			{ $match: match },
			{ $group: { _id: '$outcome', count: { $sum: 1 } } }
		])
		.toArray();
	const days = await runs(db)
		.aggregate<DayRuns>([
			{ $match: match },
			{
				$group: {
					_id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } },
					runs: { $sum: 1 },
					extracted: { $sum: { $cond: [{ $eq: ['$outcome', 'extracted'] }, 1, 0] } },
					explorers: { $addToSet: '$explorer' }
				}
			},
			{
				$project: { _id: 0, day: '$_id', runs: 1, extracted: 1, players: { $size: '$explorers' } }
			},
			{ $sort: { day: 1 } }
		])
		.toArray();
	return {
		totals: {
			runs: totals?.runs ?? 0,
			players: totals?.explorers.length ?? 0,
			byOutcome: Object.fromEntries(outcomes.map((o) => [o._id, o.count])),
			avgSeconds: totals?.avgSeconds ?? 0,
			avgDeepest: totals?.avgDeepest ?? 0,
			avgKills: totals?.avgKills ?? 0,
			avgCrates: totals?.avgCrates ?? 0,
			avgCarried: totals?.avgCarried ?? 0,
			avgManifestedAfter: totals?.avgManifestedAfter ?? null,
			solo: totals?.solo ?? 0,
			coop: totals?.coop ?? 0
		},
		days
	};
}
