import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { accountView, explorerFor, getAccount } from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS, setLook } from '#lib/server/store/explorers.ts';
import { cleanLook } from '#lib/shared/player/look.ts';
import type { RequestHandler } from './$types';

/**
 * Dress your explorer. Body: `{ look }` (see `cleanLook`: anything unknown falls back to the
 * default). Allowed any time; it shows from the next descent. Returns the account as it is
 * afterwards. See docs/dev/player.md#the-look.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => null)) as { look?: unknown } | null;
	if (!body || typeof body.look !== 'object' || body.look === null) error(400, 'Bad request');
	const explorer = await explorerFor(db, account._id);
	const result = await setLook(db, explorer._id, cleanLook(body.look));
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	return json(await accountView(db, account));
};
