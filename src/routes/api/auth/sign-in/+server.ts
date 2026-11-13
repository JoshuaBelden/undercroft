import { json } from '@sveltejs/kit';
import { cleanEmail } from '#lib/content/account.ts';
import { database } from '#lib/server/db.ts';
import { signIn } from '#lib/server/session.ts';
import { verifyLogin } from '#lib/server/store/accounts.ts';
import { throttle, throttled } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/**
 * Sign in. Body: `{ email, password }`. Answers `{ ok: true }` when signed in, or `{ mfa: true }`
 * when the account wants its two-step code next (`POST /api/auth/mfa`).
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const email = cleanEmail(body.email);
	if (email && (await throttled(db, 'signIn', email))) {
		return json({ error: 'Too many tries. Wait a few minutes, then try again' }, { status: 429 });
	}
	const account = await verifyLogin(db, body.email, body.password);
	// One message for both, so it doesn't reveal which emails have accounts.
	if (!account) {
		if (email) await throttle(db, 'signIn', email);
		return json({ error: 'Wrong email or password' }, { status: 401 });
	}
	const result = await signIn(db, cookies, account, url.protocol === 'https:');
	return json(result === 'mfa' ? { mfa: true } : { ok: true });
};
