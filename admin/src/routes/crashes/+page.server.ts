import { error, fail } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAdmin } from '#lib/server/session.ts';
import { audit, fileCrash, getError, githubEnabled, listErrors } from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Errors the servers saw, and the ones players reported from the browser, grouped by fingerprint:
 * the most recently seen first. `?source=` narrows them.
 */
export const load: PageServerLoad = async ({ url }) => {
	const raw = url.searchParams.get('source');
	const source = raw === 'client' || raw === 'web' || raw === 'game' ? raw : undefined;
	const crashes = await listErrors(await database(), { source, limit: 100 });
	return { crashes, source: source ?? null, github: githubEnabled() };
};

export const actions: Actions = {
	/** Open a GitHub issue for a crash nobody has filed yet. */
	file: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const db = await database();
		const crash = await getError(db, String((await request.formData()).get('id')));
		if (!crash) error(404, 'No such crash');
		if (crash.issue) return fail(400, { error: `Already #${crash.issue.number}` });
		try {
			const issue = await fileCrash(db, crash);
			await audit(db, admin, 'fileCrash', crash._id, `#${issue.number}`);
			return { notice: `Filed as #${issue.number}` };
		} catch (failure) {
			return fail(502, { error: (failure as Error).message });
		}
	}
};
