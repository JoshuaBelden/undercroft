import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { accountView, getAccount } from '#lib/server/store/accounts.ts';
import { unlinkDiscord } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/** Unlink Discord. Linking goes through Discord itself: `/auth/discord?link`. */
export const DELETE: RequestHandler = async ({ locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	if ((await unlinkDiscord(db, account._id)) === 'noPassword') {
		return json(
			{ error: 'Set a password first, or you would have no way to sign in' },
			{ status: 400 }
		);
	}
	const updated = (await getAccount(db, account._id)) ?? account;
	return json(await accountView(db, updated));
};
