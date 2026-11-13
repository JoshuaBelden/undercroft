import { error, redirect } from '@sveltejs/kit';
import { goToDiscord } from '#lib/server/discord.ts';
import { discordEnabled } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

/** Off to Discord, to link it to the signed-in account (from the Account screen). */
export const GET: RequestHandler = ({ cookies, url, locals }) => {
	if (!discordEnabled()) error(404, 'Not found');
	if (!locals.account) redirect(303, '/auth/sign-in');
	goToDiscord(cookies, url, 'link');
};
