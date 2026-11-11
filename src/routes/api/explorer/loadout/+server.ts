import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS, arrange } from '#lib/server/store/explorers.ts';
import { log } from '#lib/server/store/shop.ts';
import { sanitizeAction } from '#lib/shared/items/inventory.ts';
import type { RequestHandler } from './$types';

/**
 * Rearrange the stash and the loadout. The body is an `InventoryAction`, the same requests the
 * pack screen sends underground, and here slots may be in the stash:
 * `{ kind: 'move', from, to, count? }`, `{ kind: 'quick', from }`, `{ kind: 'equip', from }`,
 * `{ kind: 'split', from, count }` or `{ kind: 'drop', from, count }` (thrown away for good).
 * Returns the account as it is afterwards.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const action = sanitizeAction(await request.json().catch(() => null), true);
	if (!action) error(400, 'Bad request');
	const explorer = await explorerFor(db, account._id);

	const result = await arrange(db, explorer._id, action);
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	if (result.dropped) {
		await log(db, {
			explorer: explorer._id,
			kind: 'discard',
			item: result.dropped.item,
			count: result.dropped.count,
			money: 0,
			balance: result.explorer.money
		});
	}
	return json(await accountView(db, account));
};
