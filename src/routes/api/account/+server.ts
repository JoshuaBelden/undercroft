import { error, json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount, SESSION_COOKIE } from '#lib/server/session.ts';
import {
	ACCOUNT_ERRORS,
	accountView,
	checkPassword,
	getAccount,
	setGamerTag
} from '#lib/server/store/accounts.ts';
import { audit } from '#lib/server/store/admin.ts';
import { checkSecondFactor, throttle, throttled } from '#lib/server/store/auth.ts';
import { deleteAccount } from '#lib/server/store/deletion.ts';
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

/**
 * Delete the account for good (docs/dev/accounts.md#deleting-an-account). Body: `{ gamerTag,
 * password, code }`: the gamer tag typed out, the password if it has one, and a two-step code if
 * that is on. This browser is signed out.
 */
export const DELETE: RequestHandler = async ({ request, locals, cookies }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const account = await requireAccount(db, locals);
	const typed = typeof body.gamerTag === 'string' ? body.gamerTag.trim().toLowerCase() : '';
	if (typed !== account.tagKey) {
		return json({ error: 'Type your gamer tag to delete your account' }, { status: 400 });
	}
	if (account.password) {
		if (await throttled(db, 'signIn', account.email)) {
			return json({ error: 'Too many tries. Wait a few minutes' }, { status: 429 });
		}
		const right =
			typeof body.password === 'string' && (await checkPassword(body.password, account.password));
		if (!right) {
			await throttle(db, 'signIn', account.email);
			return json({ error: 'Your password is not right' }, { status: 400 });
		}
	}
	if (account.totp) {
		const checked = await checkSecondFactor(db, account, body.code);
		if (checked === 'throttled') {
			return json({ error: 'Too many wrong codes. Wait a few minutes' }, { status: 429 });
		}
		if (checked === 'code') return json({ error: "That code didn't work" }, { status: 400 });
	}
	await deleteAccount(db, account._id);
	await audit(
		db,
		{ id: account._id, gamerTag: account.gamerTag },
		'deleteOwnAccount',
		account._id,
		account.gamerTag
	);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ ok: true });
};
