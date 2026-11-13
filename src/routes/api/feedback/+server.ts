import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { throttle } from '#lib/server/store/auth.ts';
import { cleanFeedback, createFeedback } from '#lib/server/store/feedback.ts';
import { GAME_VERSION } from '#lib/shared/version.ts';
import type { RequestHandler } from './$types';

/** Private feedback, only read by the team. Body: `{ text }`. See docs/dev/reports.md. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	const text = cleanFeedback(await request.json().catch(() => ({})));
	if (typeof text !== 'string') return json({ error: text.error }, { status: 400 });
	if (!(await throttle(db, 'feedback', account._id))) {
		return json({ error: "You've sent a lot already. Try again in an hour" }, { status: 429 });
	}
	await createFeedback(db, { id: account._id, gamerTag: account.gamerTag }, text, GAME_VERSION);
	return json({ ok: true });
};
