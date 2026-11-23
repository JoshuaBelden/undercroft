import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS, useFreeLoadout } from '#lib/server/store/explorers.ts';
import type { RequestHandler } from './$types';

/**
 * Use free loadout (docs/dev/economy.md#free-loadout): the loadout goes into the stash and the
 * free loadout takes its place. Refused, all of it, if the stash can't take everything. Returns
 * the account as it is afterwards.
 */
export const POST: RequestHandler = async ({ locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const explorer = await explorerFor(db, account._id);
	const result = await useFreeLoadout(db, explorer._id);
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	return json(await accountView(db, account));
};
