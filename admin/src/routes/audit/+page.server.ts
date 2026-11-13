import { database } from '#lib/server/db.ts';
import { readAudit } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

/** The last changes made by admins, newest first. */
export const load: PageServerLoad = async () => {
	const entries = await readAudit(await database(), { limit: 200 });
	return { entries };
};
