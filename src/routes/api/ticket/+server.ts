import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { createTicket } from '#lib/server/store/accounts.ts';
import type { RequestHandler } from './$types';

/** A ticket for the game server, which can't see this site's session cookie. */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.account) error(401, 'Sign in first');
	return json({ ticket: await createTicket(await database(), locals.account.id) });
};
