import { fail } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAdmin } from '#lib/server/session.ts';
import { audit, listFeedback, markFeedback } from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/** The feedback inbox, newest first; `?archived=1` for what was put away. */
export const load: PageServerLoad = async ({ url }) => {
	const archived = url.searchParams.get('archived') === '1';
	return { archived, feedback: await listFeedback(await database(), { archived, limit: 100 }) };
};

export const actions: Actions = {
	read: async ({ request }) => {
		const form = await request.formData();
		const ok = await markFeedback(await database(), String(form.get('id')), {
			read: form.get('read') !== 'false'
		});
		return ok ? { notice: 'Marked' } : fail(404, { error: 'No such feedback' });
	},

	archive: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const id = String(form.get('id'));
		const archived = form.get('archived') !== 'false';
		const db = await database();
		if (!(await markFeedback(db, id, { archived, read: true }))) {
			return fail(404, { error: 'No such feedback' });
		}
		if (archived) await audit(db, admin, 'archiveFeedback', id);
		return { notice: archived ? 'Archived' : 'Back in the inbox' };
	}
};
