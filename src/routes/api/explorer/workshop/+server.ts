import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS } from '#lib/server/store/explorers.ts';
import { craft, repair, salvage } from '#lib/server/store/workshop.ts';
import type { RequestHandler } from './$types';

/**
 * The Workshop (docs/dev/crafting.md#the-workshop). Body: `{ action: 'craft', recipe, times }`
 * (from the stash, into it), `{ action: 'repair', at }` or `{ action: 'salvage', at }` (`at`: a
 * SlotRef in the stash or the loadout). Returns the account afterwards.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const explorer = await explorerFor(db, account._id);

	let result;
	if (body.action === 'craft') result = await craft(db, explorer._id, body.recipe, body.times);
	else if (body.action === 'repair') result = await repair(db, explorer._id, body.at);
	else if (body.action === 'salvage') result = await salvage(db, explorer._id, body.at);
	else error(400, 'Bad request');
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	return json(await accountView(db, account));
};
