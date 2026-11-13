import { database } from '#lib/server/db.ts';
import { searchMembers } from '#lib/server/members.ts';
import { ADMIN } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

/** Search by email, gamer tag or Discord name (`?q=`); without one, the newest members. */
export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q') ?? '';
	return { query, members: await searchMembers(await database(), query), limit: ADMIN.pageSize };
};
