import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { accountView, getAccount } from '#lib/server/store/accounts.ts';
import { checkSecondFactor, disableTotp } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/** Turn two-step sign-in off. Body: `{ code }`, from the app or a recovery code. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const account = await requireAccount(db, locals);
	if (!account.totp) return json({ error: 'Two-step sign-in is already off' }, { status: 400 });
	const checked = await checkSecondFactor(db, account, body.code);
	if (checked === 'throttled') {
		return json({ error: 'Too many wrong codes. Wait a few minutes' }, { status: 429 });
	}
	if (checked === 'code') return json({ error: "That code didn't work" }, { status: 400 });
	await disableTotp(db, account._id);
	const updated = (await getAccount(db, account._id)) ?? account;
	return json(await accountView(db, updated));
};
