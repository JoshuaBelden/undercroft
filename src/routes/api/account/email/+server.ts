import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { ACCOUNT_ERRORS, accountView, addEmail, getAccount } from '#lib/server/store/accounts.ts';
import type { RequestHandler } from './$types';

/**
 * Add an email to an account that has none (one made with Steam), so it can have a password and
 * get reset links. Body: `{ email }`. An account that has an email can't change it here.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const account = await requireAccount(db, locals);
	const failed = await addEmail(db, account._id, body.email);
	if (failed === 'hasEmail') {
		return json({ error: 'Your account already has an email' }, { status: 400 });
	}
	if (failed) return json({ error: ACCOUNT_ERRORS[failed] }, { status: 400 });
	return json(await accountView(db, (await getAccount(db, account._id)) ?? account));
};
