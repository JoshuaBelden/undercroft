import { timingSafeEqual } from 'node:crypto';
import { json, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { database } from '#lib/server/db.ts';
import { LOCAL_ACCOUNT_ID, LOCAL_COOKIE, localHost, type LocalHost } from '#lib/server/local.ts';
import { isOpen, SESSION_COOKIE } from '#lib/server/session.ts';
import { localAccount, sessionAccount } from '#lib/server/store/accounts.ts';
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
	const local = localHost();
	if (local) return handleLocal(event, resolve, local);
	const token = event.cookies.get(SESSION_COOKIE);
	const account = token ? await sessionAccount(await database(), token) : null;
	event.locals.account = account
		? { id: account._id, email: account.email ?? null, gamerTag: account.gamerTag }
		: null;

	const path = event.url.pathname;
	if (!account && !isOpen(path)) {
		if (path.startsWith('/api/')) return json({ error: 'Sign in first' }, { status: 401 });
		redirect(303, '/auth/sign-in');
	}
	return resolve(event);
};

/** Whether two secrets are the same, in time that doesn't say how much of them matched. */
function sameSecret(given: string | undefined, wanted: string): boolean {
	if (!given || given.length !== wanted.length) return false;
	return timingSafeEqual(Buffer.from(given), Buffer.from(wanted));
}

/**
 * The desktop app's own site (docs/dev/hosting.md): its window is the player, signed in as the
 * local account, and nothing else may use it. Signing in, out and up don't exist here.
 */
const handleLocal = async (
	event: Parameters<Handle>[0]['event'],
	resolve: Parameters<Handle>[0]['resolve'],
	local: LocalHost
): Promise<Response> => {
	const path = event.url.pathname;
	if (!sameSecret(event.cookies.get(LOCAL_COOKIE), local.secret)) {
		if (path.startsWith('/api/')) return json({ error: 'Not the desktop app' }, { status: 401 });
		return new Response("This is the Undercroft desktop app's own server.", { status: 403 });
	}
	const account = await localAccount(await database(), local.player, LOCAL_ACCOUNT_ID);
	event.locals.account = {
		id: account._id,
		email: account.email ?? null,
		gamerTag: account.gamerTag
	};
	if (path.startsWith('/auth/') || path.startsWith('/api/auth/')) {
		if (path.startsWith('/api/')) return json({ error: 'Not in the desktop app' }, { status: 404 });
		redirect(303, '/');
	}
	return resolve(event);
};
