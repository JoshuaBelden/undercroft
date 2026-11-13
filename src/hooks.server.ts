import { json, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { database } from '#lib/server/db.ts';
import { isOpen, SESSION_COOKIE } from '#lib/server/session.ts';
import { sessionAccount } from '#lib/server/store/accounts.ts';
import { recordError } from '#lib/server/store/reports.ts';
import { GAME_VERSION } from '#lib/shared/version.ts';

/**
 * A bug on the site's server (not a 404 or an `error()`): recorded in `errors` for the admin
 * app, and its id given to the error page, which offers to report it. See docs/dev/reports.md.
 */
export const handleError: HandleServerError = async ({ error, kind }) => {
	console.error(error);
	if (kind !== 'unknown') return;
	try {
		const errorId = await recordError(await database(), {
			source: 'web',
			message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			version: GAME_VERSION
		});
		return { message: 'Something went wrong on our side', errorId };
	} catch {
		// Without the database there is nothing to record it in; the log has it.
		return { message: 'Something went wrong on our side' };
	}
};

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
	if (!account && !isOpen(path)) {
		if (path.startsWith('/api/')) return json({ error: 'Sign in first' }, { status: 401 });
		redirect(303, '/auth/sign-in');
	}
	return resolve(event);
};
