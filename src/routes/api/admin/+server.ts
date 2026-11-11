import { error, json } from '@sveltejs/kit';
import { devMode } from '#lib/dev.ts';
import { database } from '#lib/server/db.ts';
import {
	ACCOUNT_ERRORS,
	accountView,
	explorerFor,
	getAccount,
	setPassword
} from '#lib/server/store/accounts.ts';
import { EXPLORER_ERRORS } from '#lib/server/store/explorers.ts';
import { grant, resetExplorer } from '#lib/server/store/shop.ts';
import type { RequestHandler } from './$types';

/**
 * Admin tools for accounts and the economy. Dev mode only: in a player build this endpoint does
 * not exist. Body:
 * - `{ action: 'grantMoney', amount }`, `{ action: 'grantItem', item, count }`: to your own explorer
 * - `{ action: 'resetExplorer' }`: your own explorer back to nothing
 * - `{ action: 'resetPassword', email, password }`: any account
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!devMode) error(404, 'Not found');
	const db = await database();
	const account = locals.account ? await getAccount(db, locals.account.id) : null;
	if (!account) error(401, 'Sign in first');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

	if (body.action === 'resetPassword') {
		const failed = await setPassword(db, body.email, body.password);
		if (failed) return json({ error: ACCOUNT_ERRORS[failed] }, { status: 400 });
		return json(await accountView(db, account));
	}

	const explorer = await explorerFor(db, account._id);
	let result;
	if (body.action === 'grantMoney') result = await grant(db, explorer._id, { money: body.amount });
	else if (body.action === 'grantItem') {
		result = await grant(db, explorer._id, { item: body.item, count: body.count });
	} else if (body.action === 'resetExplorer') result = await resetExplorer(db, explorer._id);
	else error(400, 'Bad request');
	if ('error' in result) return json({ error: EXPLORER_ERRORS[result.error] }, { status: 400 });
	return json(await accountView(db, account));
};
