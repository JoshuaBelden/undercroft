import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import {
	ACCOUNT_ERRORS,
	accountView,
	getAccount,
	setGamerTag
} from '#lib/server/store/accounts.ts';
import type { RequestHandler } from './$types';

/** The signed-in account: gamer tag, explorer, rite progress. */
export const GET: RequestHandler = async ({ locals }) => {
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	return json(await accountView(db, account));
};

/** Change the gamer tag. Body: `{ gamerTag }`. */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const result = await setGamerTag(await database(), locals.account.id, body.gamerTag);
	if ('error' in result) return json({ error: ACCOUNT_ERRORS[result.error] }, { status: 400 });
	return json(result);
};
