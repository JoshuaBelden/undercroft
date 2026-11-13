import { redirect } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { ADMIN_COOKIE } from '#lib/server/session.ts';
import { deleteAdminSession } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Ends this admin-app session (the game session, on its own origin, is untouched). */
export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(ADMIN_COOKIE);
	if (token) await deleteAdminSession(await database(), token);
	cookies.delete(ADMIN_COOKIE, { path: '/' });
	redirect(303, '/sign-in');
};
