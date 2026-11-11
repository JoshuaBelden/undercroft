import { json, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { database } from '#lib/server/db.ts';
import { SESSION_COOKIE } from '#lib/server/session.ts';
import { sessionAccount } from '#lib/server/store/accounts.ts';

/** Paths that work without being signed in: the sign-in pages and their endpoints. */
const OPEN = ['/auth/', '/api/auth/'];

/**
 * Every request: find the account from the session cookie. The whole game is behind sign-in, so
 * anything else is sent to the sign-in page (or refused, for API calls).
 */
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	const account = token ? await sessionAccount(await database(), token) : null;
	event.locals.account = account
		? { id: account._id, email: account.email, gamerTag: account.gamerTag }
		: null;

	const path = event.url.pathname;
	if (!account && !OPEN.some((open) => path.startsWith(open))) {
		if (path.startsWith('/api/')) return json({ error: 'Sign in first' }, { status: 401 });
		redirect(303, '/auth/sign-in');
	}
	return resolve(event);
};
