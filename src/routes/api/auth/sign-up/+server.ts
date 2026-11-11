import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { setSessionCookie } from '#lib/server/session.ts';
import { ACCOUNT_ERRORS, createAccount, createSession } from '#lib/server/store/accounts.ts';
import type { RequestHandler } from './$types';

/** Create an account and sign in. Body: `{ email, password, gamerTag }`. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const result = await createAccount(db, {
		email: body.email,
		password: body.password,
		gamerTag: body.gamerTag
	});
	if ('error' in result) return json({ error: ACCOUNT_ERRORS[result.error] }, { status: 400 });
	const token = await createSession(db, result.account._id);
	setSessionCookie(cookies, token, url.protocol === 'https:');
	return json({ ok: true });
};
