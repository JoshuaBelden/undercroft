import type { Cookies } from '@sveltejs/kit';
import { ACCOUNT } from '#lib/content/account.ts';

export const SESSION_COOKIE = 'undercroft.session';

/** Sign this browser in: script can't read the cookie, and other sites can't send it for us. */
export function setSessionCookie(cookies: Cookies, token: string, secure: boolean): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: ACCOUNT.sessionDays * 86400
	});
}
