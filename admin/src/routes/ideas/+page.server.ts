import { error, fail } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAdmin } from '#lib/server/session.ts';
import {
	BOARD_STATUSES,
	IDEA,
	audit,
	cleanLine,
	cleanText,
	getIdea,
	listIdeas,
	mergeIdea,
	updateIdea,
	type IdeaStatus
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/** Ideas waiting for approval (oldest first), and the board (most votes first). */
export const load: PageServerLoad = async ({ url }) => {
	const db = await database();
	const view = url.searchParams.get('view') === 'board' ? 'board' : 'queue';
	const pending = await listIdeas(db, { status: 'pending' });
	const board = (await listIdeas(db)).filter((idea) => idea.status !== 'pending');
	return { view, pending, board };
};

/** The idea an action is about, from the form's `id`. */
async function idea(form: FormData) {
	const db = await database();
	const found = await getIdea(db, String(form.get('id')));
	if (!found) error(404, 'No such idea');
	return { db, idea: found };
}

/** Title and description from the form, tidied the way a player's are. */
function wording(form: FormData): { title: string; body: string } | { error: string } {
	const title = cleanLine(form.get('title'), IDEA.titleMax);
	const body = cleanText(form.get('body') ?? '', IDEA.bodyMax);
	if (!title || title.length < IDEA.titleMin) return { error: 'The title is too short or long' };
	if (body === null) return { error: 'The description is too long' };
	return { title, body };
}

export const actions: Actions = {
	/** Put it on the board, worded as the admin tidied it. */
	approve: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const { db, idea: found } = await idea(form);
		const words = wording(form);
		if ('error' in words) return fail(400, { error: words.error });
		await updateIdea(db, found._id, { ...words, status: 'open' });
		await audit(db, admin, 'approveIdea', found._id, words.title);
		return { notice: 'On the board' };
	},

	decline: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const { db, idea: found } = await idea(form);
		const note = cleanText(form.get('note') ?? '', IDEA.noteMax) ?? '';
		await updateIdea(db, found._id, { status: 'declined', note });
		await audit(db, admin, 'declineIdea', found._id, found.title);
		return { notice: 'Declined' };
	},

	/** Status, wording, the note players see, the GitHub issue. */
	update: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const { db, idea: found } = await idea(form);
		const status = String(form.get('status')) as IdeaStatus;
		if (!BOARD_STATUSES.includes(status)) return fail(400, { error: 'Not a status' });
		const words = wording(form);
		if ('error' in words) return fail(400, { error: words.error });
		const note = cleanText(form.get('note') ?? '', IDEA.noteMax);
		if (note === null)
			return fail(400, { error: `Keep the note under ${IDEA.noteMax} characters` });
		const issue = cleanLine(form.get('issue') ?? '', 200) ?? '';
		await updateIdea(db, found._id, { ...words, status, note, issue });
		await audit(db, admin, 'updateIdea', found._id, `${words.title}: ${status}`);
		return { notice: 'Saved' };
	},

	/** A duplicate: its votes go to the other idea. */
	merge: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const { db, idea: found } = await idea(form);
		const into = String(form.get('into') ?? '');
		const target = await getIdea(db, into);
		if (!target || !(await mergeIdea(db, found._id, into))) {
			return fail(400, { error: 'Choose an idea on the board to merge it into' });
		}
		await audit(db, admin, 'mergeIdea', found._id, `${found.title} → ${target.title}`);
		return { notice: `Merged into "${target.title}"` };
	}
};
