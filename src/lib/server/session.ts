import { error, type Cookies } from '@sveltejs/kit';
import type { Db } from 'mongodb';
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from '$app/env/private';
import { ACCOUNT } from '#lib/content/account.ts';
import {
	activeSuspension,
	createSession,
	getAccount,
	suspensionMessage,
	type AccountDoc
} from '#lib/server/store/accounts.ts';
import { startChallenge } from '#lib/server/store/auth.ts';

export const SESSION_COOKIE = 'undercroft.session';
/** A sign-in waiting for its two-step code (see `signIn`). */
export const CHALLENGE_COOKIE = 'undercroft.challenge';
/** A Discord sign-up waiting for its gamer tag. */
export const SIGNUP_COOKIE = 'undercroft.signup';
/** The Discord round trip: the `state` we sent, and whether it is linking a signed-in account. */
export const OAUTH_COOKIE = 'undercroft.oauth';

/**
 * Paths that work without being signed in: the sign-in pages and their endpoints. Everything else
 * (the release notes and credits too) is behind sign-in.
 */
export const isOpen = (path: string): boolean =>
	['/auth/', '/api/auth/'].some((open) => path.startsWith(open));

/** "Sign in with Discord" is offered only when the Discord application is configured. */
export const discordEnabled = (): boolean => Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);

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

/** A short-lived cookie for one step of signing in (the challenge, the sign-up, the Discord trip). */
export function setStepCookie(
	cookies: Cookies,
	name: string,
	value: string,
	minutes: number,
	secure: boolean
): void {
	cookies.set(name, value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: minutes * 60
	});
}

/** The signed-in account's document, for an API call that changes it; 401 if there isn't one. */
export async function requireAccount(db: Db, locals: App.Locals): Promise<AccountDoc> {
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	return account;
}

/**
 * The account proved who it is (password or Discord). Without two-step sign-in, that is a
 * session. With it, a challenge waits for the code: the browser goes to `/auth/mfa` for it.
 */
export async function signIn(
	db: Db,
	cookies: Cookies,
	account: AccountDoc,
	secure: boolean
): Promise<'signedIn' | 'mfa' | { suspended: string }> {
	// Suspended by an admin: no session, and the reason (see docs/dev/admin.md#suspending).
	const suspension = activeSuspension(account);
	if (suspension) return { suspended: suspensionMessage(suspension) };
	if (account.totp) {
		const challenge = await startChallenge(db, account._id);
		setStepCookie(cookies, CHALLENGE_COOKIE, challenge, ACCOUNT.challengeMinutes, secure);
		return 'mfa';
	}
	setSessionCookie(cookies, await createSession(db, account._id), secure);
	return 'signedIn';
}
