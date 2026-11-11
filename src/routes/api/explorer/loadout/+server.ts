import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS, stowInStash, takeFromStash } from '#lib/server/store/explorers.ts';
import { sanitizeAction } from '#lib/shared/items/inventory.ts';
import type { RequestHandler } from './$types';

/**
 * Move things between the stash and the loadout. Body:
 * `{ action: 'take', index, count }` (stash entry to loadout) or
 * `{ action: 'stow', from, count }` (loadout to stash; `from` is an ItemRef).
 * Returns the account as it is afterwards.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const explorer = await explorerFor(db, account._id);
	const count = typeof body.count === 'number' && Number.isFinite(body.count) ? body.count : 1;

	let result;
	if (body.action === 'take') {
		const index = typeof body.index === 'number' && Number.isInteger(body.index) ? body.index : -1;
		result = await takeFromStash(db, explorer._id, index, count);
	} else if (body.action === 'stow') {
		// The same shape as dropping from the pack screen: reuse its checks.
		const parsed = sanitizeAction({ kind: 'drop', from: body.from, count });
		if (!parsed) error(400, 'Bad request');
		result = await stowInStash(db, explorer._id, parsed.from, count);
	} else {
		error(400, 'Bad request');
	}
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	return json(await accountView(db, account));
};
