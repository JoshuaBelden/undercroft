import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS } from '#lib/server/store/explorers.ts';
import { buy, sell } from '#lib/server/store/shop.ts';
import type { RequestHandler } from './$types';

/**
 * The shop. Body: `{ action: 'buy', item, lots }` (into the stash) or
 * `{ action: 'sell', from, count }` (`from`: a SlotRef in the stash or the loadout). Returns the
 * account afterwards.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const explorer = await explorerFor(db, account._id);

	let result;
	if (body.action === 'buy') result = await buy(db, explorer._id, body.item, body.lots);
	else if (body.action === 'sell') result = await sell(db, explorer._id, body.from, body.count);
	else error(400, 'Bad request');
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	return json(await accountView(db, account));
};
