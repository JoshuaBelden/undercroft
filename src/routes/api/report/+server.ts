import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { fileReport } from '#lib/server/github.ts';
import { requireAccount } from '#lib/server/session.ts';
import { throttle } from '#lib/server/store/auth.ts';
import { cleanReport, createReport } from '#lib/server/store/reports.ts';
import { GAME_VERSION } from '#lib/shared/version.ts';
import type { RequestHandler } from './$types';

/**
 * A bug report from the game. Body: `ReportInput` (src/lib/shared/reports.ts). It is kept, then
 * filed on GitHub. Answers `{ id, issue }`: the issue number once filed, null if it is waiting.
 * See docs/dev/reports.md.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	const input = cleanReport(await request.json().catch(() => ({})));
	if ('error' in input) return json({ error: input.error }, { status: 400 });
	if (!(await throttle(db, 'report', account._id))) {
		return json({ error: "You've sent a lot of reports. Try again in an hour" }, { status: 429 });
	}
	const report = await createReport(
		db,
		{ id: account._id, gamerTag: account.gamerTag },
		input,
		GAME_VERSION
	);
	const issue = await fileReport(db, report);
	return json({ id: report._id, issue: issue?.number ?? null });
};
