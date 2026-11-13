import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { accountView, getAccount } from '#lib/server/store/accounts.ts';
import { enableTotp, throttle, throttled } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/**
 * Turn two-step sign-in on. Body: `{ code }` from the app, after `/setup`. Answers with the
 * recovery codes, which are shown this once, and the account.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const account = await requireAccount(db, locals);
	if (await throttled(db, 'code', account._id)) {
		return json({ error: 'Too many wrong codes. Wait a few minutes' }, { status: 429 });
	}
	const codes = await enableTotp(db, account._id, body.code);
	if (!codes) {
		await throttle(db, 'code', account._id);
		return json(
			{ error: "That code didn't work. Try the newest one from your app" },
			{ status: 400 }
		);
	}
	const updated = (await getAccount(db, account._id)) ?? account;
	return json({ codes, account: await accountView(db, updated) });
};
