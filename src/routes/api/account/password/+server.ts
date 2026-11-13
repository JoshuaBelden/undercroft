import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount, SESSION_COOKIE } from '#lib/server/session.ts';
import {
	ACCOUNT_ERRORS,
	accountView,
	checkPassword,
	deleteSessionsFor,
	getAccount,
	setAccountPassword
} from '#lib/server/store/accounts.ts';
import { throttle, throttled } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/**
 * Change the password, or set one for an account made with Discord. Body: `{ current, password }`
 * (`current` only when it has one). Every other browser is signed out.
 */
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const account = await requireAccount(db, locals);
	if (account.password) {
		if (await throttled(db, 'signIn', account.email)) {
			return json({ error: 'Too many tries. Wait a few minutes' }, { status: 429 });
		}
		const right =
			typeof body.current === 'string' && (await checkPassword(body.current, account.password));
		if (!right) {
			await throttle(db, 'signIn', account.email);
			return json({ error: 'Your current password is not right' }, { status: 400 });
		}
	}
	const failed = await setAccountPassword(db, account._id, body.password);
	if (failed) return json({ error: ACCOUNT_ERRORS[failed] }, { status: 400 });
	await deleteSessionsFor(db, account._id, cookies.get(SESSION_COOKIE));
	const updated = await getAccount(db, account._id);
	return json(await accountView(db, updated ?? account));
};
