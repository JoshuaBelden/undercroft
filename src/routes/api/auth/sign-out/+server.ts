import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { SESSION_COOKIE } from '#lib/server/session.ts';
import { deleteSession } from '#lib/server/store/accounts.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await deleteSession(await database(), token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ ok: true });
};
