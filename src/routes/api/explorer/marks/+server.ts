import { error, json } from '@sveltejs/kit';
import { cleanMarkWheel } from '#lib/content/marks.ts';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS, setMarkWheel } from '#lib/server/store/explorers.ts';
import type { RequestHandler } from './$types';

/**
 * Choose the chalk symbols on your wheel. Body: `{ wheel }`, eight distinct symbol ids, top first
 * and clockwise (see `cleanMarkWheel`). Refused while underground or ready to descend. Returns the
 * account as it is afterwards. See docs/dev/marks.md.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => null)) as { wheel?: unknown } | null;
	const wheel = cleanMarkWheel(body?.wheel);
	if (!wheel) error(400, 'Bad request');
	const explorer = await explorerFor(db, account._id);
	const result = await setMarkWheel(db, explorer._id, wheel);
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	return json(await accountView(db, account));
};
