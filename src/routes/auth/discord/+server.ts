import { error } from '@sveltejs/kit';
import { goToDiscord } from '#lib/server/discord.ts';
import { discordEnabled } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

/** Off to Discord, to sign in (or sign up) with it. */
export const GET: RequestHandler = ({ cookies, url }) => {
	if (!discordEnabled()) error(404, 'Not found');
	goToDiscord(cookies, url, 'in');
};
