import { error, redirect } from '@sveltejs/kit';
import { ACCOUNT, cleanEmail } from '#lib/content/account.ts';
import { database } from '#lib/server/db.ts';
import { discordUser } from '#lib/server/discord.ts';
import {
	discordEnabled,
	OAUTH_COOKIE,
	setStepCookie,
	signIn,
	SIGNUP_COOKIE
} from '#lib/server/session.ts';
import {
	accountByDiscord,
	accountByEmail,
	linkDiscord,
	startSignup
} from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/**
 * Back from Discord. Signs in the account linked to this Discord account; or links it (from the
 * Account screen); or starts a new account. An email that already has an account is never linked
 * by itself: whoever controls that Discord account might not own the Undercroft one.
 */
export const GET: RequestHandler = async ({ cookies, url, locals }) => {
	if (!discordEnabled()) error(404, 'Not found');
	const [state, mode] = (cookies.get(OAUTH_COOKIE) ?? '').split(':');
	cookies.delete(OAUTH_COOKIE, { path: '/' });
	const linking = mode === 'link' && locals.account !== null;
	const back: (reason: string) => never = (reason) =>
		redirect(303, linking ? `/account?discord=${reason}` : `/auth/sign-in?discord=${reason}`);

	const code = url.searchParams.get('code');
	// No code: they said no on Discord's page. A wrong state: not a trip we started.
	if (!code || !state || url.searchParams.get('state') !== state) back('cancelled');
	const user = await discordUser(url.origin, code);
	if (!user) back('failed');
	const discord = { id: user.id, username: user.username };
	const db = await database();
	const secure = url.protocol === 'https:';

	if (linking && locals.account) {
		const failed = await linkDiscord(db, locals.account.id, discord);
		back(failed ? 'taken' : 'linked');
	}

	const linked = await accountByDiscord(db, discord.id);
	if (linked) {
		const result = await signIn(db, cookies, linked, secure);
		redirect(303, result === 'mfa' ? '/auth/mfa' : '/');
	}

	const email = cleanEmail(user.email);
	if (!email) back('unverified');
	if (await accountByEmail(db, email)) back('email');

	const signup = await startSignup(db, discord, email);
	setStepCookie(cookies, SIGNUP_COOKIE, signup, ACCOUNT.signupMinutes, secure);
	const suggestion = user.globalName ?? user.username;
	redirect(303, `/auth/discord/tag?suggest=${encodeURIComponent(suggestion)}`);
};
