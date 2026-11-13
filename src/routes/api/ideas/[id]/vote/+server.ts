import { json, type RequestEvent } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { throttle } from '#lib/server/store/auth.ts';
import { setVote } from '#lib/server/store/feedback.ts';
import type { RequestHandler } from './$types';

/** Vote for an idea (POST) or take the vote back (DELETE). Answers `{ votes, voted }`. */
async function vote(event: RequestEvent<{ id: string }>, on: boolean): Promise<Response> {
	const db = await database();
	const account = await requireAccount(db, event.locals);
	if (!(await throttle(db, 'vote', account._id))) {
		return json({ error: 'Too many votes at once. Try again later' }, { status: 429 });
	}
	const votes = await setVote(db, event.params.id, account._id, on);
	if (votes === null) return json({ error: "That idea can't be voted on" }, { status: 404 });
	return json({ votes, voted: on });
}

export const POST: RequestHandler = (event) => vote(event, true);
export const DELETE: RequestHandler = (event) => vote(event, false);
