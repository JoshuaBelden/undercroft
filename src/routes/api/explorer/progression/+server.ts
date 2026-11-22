import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { progressionError, respecPoints, spendPoint } from '#lib/server/store/progression.ts';
import type { RequestHandler } from './$types';

/**
 * The skill tree (docs/dev/progression.md#the-skill-tree). Body: `{ action: 'spend', category }`
 * or `{ action: 'spend', skill }` (a point), or `{ action: 'respec' }` (every point back, for
 * coin). Returns the account afterwards.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const explorer = await explorerFor(db, account._id);

	let result;
	if (body.action === 'spend') {
		result = await spendPoint(db, explorer._id, { category: body.category, skill: body.skill });
	} else if (body.action === 'respec') result = await respecPoints(db, explorer._id);
	else error(400, 'Bad request');
	if ('error' in result) return json({ error: progressionError(result.error) }, { status: 400 });
	return json(await accountView(db, account));
};
