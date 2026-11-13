import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { database } from '#lib/server/db.ts';
import { ADMIN_COOKIE } from '#lib/server/session.ts';
import { adminSessionAccount } from '#lib/server/store.ts';

/**
 * Every request: find the admin from the session cookie. The role is checked again each time, so
 * an admin who loses it (or is suspended) is out on their next click. Everyone else gets only the
 * sign-in page.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(ADMIN_COOKIE);
	const account = token ? await adminSessionAccount(await database(), token) : null;
	event.locals.admin = account
		? { id: account._id, email: account.email, gamerTag: account.gamerTag }
		: null;
	if (!account && event.url.pathname !== '/sign-in') redirect(303, '/sign-in');
	const response = await resolve(event);
	// Nothing here belongs in a cache or a frame on another site.
	response.headers.set('cache-control', 'no-store');
	response.headers.set('x-frame-options', 'DENY');
	return response;
};
