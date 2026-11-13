import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount, SESSION_COOKIE } from '#lib/server/session.ts';
import { deleteSessionsFor } from '#lib/server/store/accounts.ts';
import type { RequestHandler } from './$types';

/** Sign out every other browser this account is signed in on. This one stays signed in. */
export const DELETE: RequestHandler = async ({ locals, cookies }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	await deleteSessionsFor(db, account._id, cookies.get(SESSION_COOKIE));
	return json({ ok: true });
};
