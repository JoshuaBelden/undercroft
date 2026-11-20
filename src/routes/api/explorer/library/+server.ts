import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { seen } from '#lib/server/store/discoveries.ts';
import type { RequestHandler } from './$types';

/**
 * Discoveries looked at (docs/dev/crafting.md#discovery). Body: `{ seen: string[] }`, item ids no
 * longer fresh (their slots stop shimmering). Returns the account afterwards.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const items = Array.isArray(body.seen) ? body.seen.filter((i) => typeof i === 'string') : [];
	if (!items.length || items.length > 200) error(400, 'Bad request');
	const explorer = await explorerFor(db, account._id);
	await seen(db, explorer._id, items as string[]);
	return json(await accountView(db, account));
};
