import { error, type Cookies } from '@sveltejs/kit';
import { ADMIN } from './store.ts';

/** The admin app's own session: a different cookie (and origin) from the game's. */
export const ADMIN_COOKIE = 'undercroft.admin';

export function setAdminCookie(cookies: Cookies, token: string, secure: boolean): void {
	cookies.set(ADMIN_COOKIE, token, {
		path: '/',
		httpOnly: true,
		// Strict: the admin app is never reached by following a link from another site.
		sameSite: 'strict',
		secure,
		maxAge: ADMIN.sessionHours * 3600
	});
}

/** The signed-in admin, for a load or an action. hooks.server.ts already sent everyone else away. */
export function requireAdmin(locals: App.Locals): NonNullable<App.Locals['admin']> {
	if (!locals.admin) error(401, 'Sign in first');
	return locals.admin;
}
