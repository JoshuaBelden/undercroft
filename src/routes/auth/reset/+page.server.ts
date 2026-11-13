import { database } from '#lib/server/db.ts';
import { resetIsValid } from '#lib/server/store/auth.ts';
import type { PageServerLoad } from './$types';

/** Whether the emailed link still works, so the page can say so before asking for a password. */
export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token') ?? '';
	return { token, valid: await resetIsValid(await database(), token) };
};
