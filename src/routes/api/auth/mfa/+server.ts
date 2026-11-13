import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { CHALLENGE_COOKIE, setSessionCookie } from '#lib/server/session.ts';
import { createSession } from '#lib/server/store/accounts.ts';
import { finishChallenge, type ChallengeError } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

const ERRORS: Record<ChallengeError, string> = {
	expired: 'That took too long. Sign in again',
	code: "That code didn't work. Try the newest one from your app",
	throttled: 'Too many wrong codes. Wait a few minutes, then sign in again'
};

/** The second step of signing in. Body: `{ code }` (from the app, or a recovery code). */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const result = await finishChallenge(db, cookies.get(CHALLENGE_COOKIE), body.code);
	if ('error' in result) {
		if (result.error !== 'code') cookies.delete(CHALLENGE_COOKIE, { path: '/' });
		// 410: this sign-in is over, start again. 400: try another code.
		return json({ error: ERRORS[result.error] }, { status: result.error === 'code' ? 400 : 410 });
	}
	cookies.delete(CHALLENGE_COOKIE, { path: '/' });
	setSessionCookie(cookies, await createSession(db, result.account._id), url.protocol === 'https:');
	return json({ ok: true });
};
