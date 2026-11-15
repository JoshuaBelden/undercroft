import { redirect } from '@sveltejs/kit';
import { localHost } from '#lib/server/local.ts';
import { isOpen } from '#lib/server/session.ts';
import type { LayoutServerLoad } from './$types';

/**
 * Who is signed in, for every page (null only on the sign-in pages). It reads the URL, so it runs
 * again on every navigation, in the browser too: a session that ended (signed out, reset, expired)
 * goes to the sign-in page on the next click instead of showing a page with no account behind it.
 * `local`: this is the desktop app's own site (docs/dev/hosting.md), which hides what only the
 * hosted site has (signing in and out, bug reports, ideas, the friends list).
 */
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.account && !isOpen(url.pathname)) redirect(303, '/auth/sign-in');
	return { account: locals.account, local: localHost() !== null };
};
