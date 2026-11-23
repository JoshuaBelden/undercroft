import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS } from '#lib/server/store/explorers.ts';
import { buyFromNpc, commitQuest, reportQuest } from '#lib/server/store/quests.ts';
import type { RequestHandler } from './$types';

/**
 * Quests and the people on the surface (docs/dev/quests.md). Body:
 * `{ action: 'commit', quest, from }` (`from`: a SlotRef in the stash or the loadout),
 * `{ action: 'report', quest }` or `{ action: 'buy', npc, item }`. Returns the account afterwards.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const explorer = await explorerFor(db, account._id);

	let result;
	if (body.action === 'commit') result = await commitQuest(db, explorer._id, body.quest, body.from);
	else if (body.action === 'report') result = await reportQuest(db, explorer._id, body.quest);
	else if (body.action === 'buy') result = await buyFromNpc(db, explorer._id, body.npc, body.item);
	else error(400, 'Bad request');
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	return json(await accountView(db, account));
};
