import { randomBytes } from 'node:crypto';
import { redirect, type Cookies } from '@sveltejs/kit';
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from '$app/env/private';
import { OAUTH_COOKIE, setStepCookie } from '#lib/server/session.ts';
import { isDiscordAvatar } from '#lib/shared/account/avatar.ts';

/**
 * "Sign in with Discord": the OAuth2 authorization-code flow, with the `identify` and `email`
 * scopes. See docs/dev/accounts.md#discord.
 */

/** Where Discord sends the player back. It must be listed in the Discord application. */
export const callbackUrl = (origin: string): string => `${origin}/auth/discord/callback`;

/** The Discord page that asks the player to let Undercroft see who they are. */
export function authorizeUrl(origin: string, state: string): string {
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: DISCORD_CLIENT_ID,
		scope: 'identify email',
		state,
		redirect_uri: callbackUrl(origin),
		prompt: 'none'
	});
	return `https://discord.com/oauth2/authorize?${params}`;
}

/**
 * Send the browser to Discord. The `state` we send must come back, so the callback knows the trip
 * is one this browser started; `mode` says whether it signs in or links the signed-in account.
 */
export function goToDiscord(cookies: Cookies, url: URL, mode: 'in' | 'link'): never {
	const state = randomBytes(24).toString('hex');
	setStepCookie(cookies, OAUTH_COOKIE, `${state}:${mode}`, 10, url.protocol === 'https:');
	// Only to Discord: SvelteKit refuses any other site unless it is allowed here.
	redirect(303, authorizeUrl(url.origin, state), { external: ['https://discord.com'] });
}

export interface DiscordUser {
	id: string;
	username: string;
	/** Their display name, if they set one. */
	globalName: string | null;
	/** Null if Discord has no verified email for them. */
	email: string | null;
	/** Their avatar's hash; null for Discord's default picture (or anything that isn't a hash). */
	avatar: string | null;
}

/** Trade the code Discord sent back for who the player is. Null if Discord refuses. */
export async function discordUser(origin: string, code: string): Promise<DiscordUser | null> {
	const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			authorization: `Basic ${Buffer.from(`${DISCORD_CLIENT_ID}:${DISCORD_CLIENT_SECRET}`).toString('base64')}`
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: callbackUrl(origin)
		})
	});
	if (!tokenResponse.ok) return null;
	const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
	if (!accessToken) return null;
	const userResponse = await fetch('https://discord.com/api/users/@me', {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	if (!userResponse.ok) return null;
	const user = (await userResponse.json()) as {
		id?: string;
		username?: string;
		global_name?: string | null;
		email?: string | null;
		verified?: boolean;
		avatar?: string | null;
	};
	if (!user.id || !user.username) return null;
	return {
		id: user.id,
		username: user.username,
		globalName: user.global_name ?? null,
		email: user.verified && user.email ? user.email.toLowerCase() : null,
		avatar: isDiscordAvatar(user.avatar) ? user.avatar : null
	};
}
