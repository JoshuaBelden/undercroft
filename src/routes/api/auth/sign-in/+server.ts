import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { setSessionCookie } from '#lib/server/session.ts';
import { createSession, verifyLogin } from '#lib/server/store/accounts.ts';
import type { RequestHandler } from './$types';

/** Sign in. Body: `{ email, password }`. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const account = await verifyLogin(db, body.email, body.password);
	// One message for both, so it doesn't reveal which emails have accounts.
	if (!account) return json({ error: 'Wrong email or password' }, { status: 401 });
	const token = await createSession(db, account._id);
	setSessionCookie(cookies, token, url.protocol === 'https:');
	return json({ ok: true });
};
