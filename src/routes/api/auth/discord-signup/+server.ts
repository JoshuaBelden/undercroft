import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { SIGNUP_COOKIE, signIn } from '#lib/server/session.ts';
import { ACCOUNT_ERRORS } from '#lib/server/store/accounts.ts';
import { finishSignup } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/** Finish signing up with Discord: create the account with this gamer tag. Body: `{ gamerTag }`. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const result = await finishSignup(db, cookies.get(SIGNUP_COOKIE), body.gamerTag);
	if ('error' in result) {
		const message =
			result.error === 'expired'
				? 'That took too long. Sign in with Discord again'
				: ACCOUNT_ERRORS[result.error];
		return json({ error: message }, { status: 400 });
	}
	cookies.delete(SIGNUP_COOKIE, { path: '/' });
	await signIn(db, cookies, result.account, url.protocol === 'https:');
	return json({ ok: true });
};
