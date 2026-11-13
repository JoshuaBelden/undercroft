import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { throttle } from '#lib/server/store/auth.ts';
import { boardFor, cleanIdea, createIdea } from '#lib/server/store/feedback.ts';
import type { RequestHandler } from './$types';

/** The ideas board as this player sees it: `{ ideas: IdeaView[] }`. See docs/dev/reports.md. */
export const GET: RequestHandler = async ({ locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	return json({ ideas: await boardFor(db, account._id) });
};

/** Suggest an idea. Body: `{ title, body }`. It waits for an admin before it is on the board. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	const input = cleanIdea(await request.json().catch(() => ({})));
	if ('error' in input) return json({ error: input.error }, { status: 400 });
	if (!(await throttle(db, 'idea', account._id))) {
		return json({ error: "That's a lot of ideas at once. Try again in an hour" }, { status: 429 });
	}
	await createIdea(db, { id: account._id, gamerTag: account.gamerTag }, input);
	return json({ ideas: await boardFor(db, account._id) });
};
