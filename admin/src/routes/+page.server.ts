import { database } from '#lib/server/db.ts';
import { eachDay, economy, memberCounts, signupsByDay } from '#lib/server/stats.ts';
import {
	listErrors,
	listIdeas,
	listReports,
	readServerStatus,
	runSummary,
	unreadFeedback
} from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

/** How many days the dashboard looks back (`?days=`, 7 to 90). */
const DAYS = [7, 14, 30, 90];

/** The dashboard: who is on now, what needs an answer, and how the game is going. */
export const load: PageServerLoad = async ({ url }) => {
	const db = await database();
	const asked = Number(url.searchParams.get('days'));
	const days = DAYS.includes(asked) ? asked : 14;
	const since = new Date(Date.now() - (days - 1) * 86400_000);
	since.setUTCHours(0, 0, 0, 0);

	const [status, members, signups, runs, money, ideas, feedback, failed, crashes] =
		await Promise.all([
			readServerStatus(db),
			memberCounts(db),
			signupsByDay(db, since),
			runSummary(db, since),
			economy(db, since),
			listIdeas(db, { status: 'pending' }),
			unreadFeedback(db),
			listReports(db, { status: 'failed' }),
			listErrors(db, { limit: 200 })
		]);

	const byDay = <T extends { day: string }>(list: T[]): Map<string, T> =>
		new Map(list.map((row) => [row.day, row]));
	const signupDays = byDay(signups);
	const runDays = byDay(runs.days);
	const calendar = eachDay(since);
	const dayAgo = Date.now() - 86400_000;

	return {
		days,
		choices: DAYS,
		/** The game server's status is stale if it hasn't written for a minute: it is down. */
		status: status && Date.now() - status.updatedAt.getTime() < 60_000 ? status : null,
		lastStatus: status?.updatedAt ?? null,
		members,
		runs: runs.totals,
		signupChart: calendar.map((day) => ({ day, signups: signupDays.get(day)?.signups ?? 0 })),
		runChart: calendar.map((day) => ({
			day,
			runs: runDays.get(day)?.runs ?? 0,
			extracted: runDays.get(day)?.extracted ?? 0
		})),
		playerChart: calendar.map((day) => ({ day, players: runDays.get(day)?.players ?? 0 })),
		money,
		todo: {
			ideas: ideas.length,
			feedback,
			failed: failed.length,
			crashes: crashes.filter((crash) => crash.lastSeen.getTime() > dayAgo).length
		}
	};
};
