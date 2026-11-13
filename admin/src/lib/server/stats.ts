import type { Db } from 'mongodb';
import type { AccountDoc, LedgerDoc } from './store.ts';

/**
 * Numbers for the dashboard that come from accounts and the ledger (runs and the server's status
 * are in src/lib/server/store/runs.ts).
 */

/** Sign-ups per UTC day since `since`. */
export async function signupsByDay(
	db: Db,
	since: Date
): Promise<{ day: string; signups: number }[]> {
	return db
		.collection<AccountDoc>('accounts')
		.aggregate<{ day: string; signups: number }>([
			{ $match: { createdAt: { $gte: since } } },
			{
				$group: {
					_id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
					signups: { $sum: 1 }
				}
			},
			{ $project: { _id: 0, day: '$_id', signups: 1 } },
			{ $sort: { day: 1 } }
		])
		.toArray();
}

/** Members, and how many played (got a game ticket) in the last day and week. */
export async function memberCounts(
	db: Db
): Promise<{ total: number; daily: number; weekly: number; suspended: number }> {
	const accounts = db.collection<AccountDoc>('accounts');
	const ago = (days: number): Date => new Date(Date.now() - days * 86400_000);
	const [total, daily, weekly, suspended] = await Promise.all([
		accounts.countDocuments(),
		accounts.countDocuments({ lastSeen: { $gte: ago(1) } }),
		accounts.countDocuments({ lastSeen: { $gte: ago(7) } }),
		accounts.countDocuments({ suspended: { $exists: true } })
	]);
	return { total, daily, weekly, suspended };
}

/** Money that came into explorers' hands and went out, by kind, since `since`. */
export async function economy(
	db: Db,
	since: Date
): Promise<{ kind: string; money: number; count: number }[]> {
	return db
		.collection<LedgerDoc>('ledger')
		.aggregate<{ kind: string; money: number; count: number }>([
			{ $match: { at: { $gte: since } } },
			{ $group: { _id: '$kind', money: { $sum: '$money' }, count: { $sum: 1 } } },
			{ $project: { _id: 0, kind: '$_id', money: 1, count: 1 } },
			{ $sort: { kind: 1 } }
		])
		.toArray();
}

/** Every day from `since` to today, so a chart shows the quiet days too. */
export function eachDay(since: Date): string[] {
	const days: string[] = [];
	const day = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
	while (day.getTime() <= Date.now()) {
		days.push(day.toISOString().slice(0, 10));
		day.setUTCDate(day.getUTCDate() + 1);
	}
	return days;
}
