import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { requireAccount, steamConfig } from '#lib/server/session.ts';
import { cleanPersona, STEAM_ERRORS, verifySteamTicket } from '#lib/server/steam.ts';
import { ACCOUNT_ERRORS, accountView, getAccount } from '#lib/server/store/accounts.ts';
import { linkSteam, throttle, unlinkSteam } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/**
 * Link the Steam account the desktop app is running under. Body: `{ ticket, steamId, persona }`,
 * as for `/api/auth/steam`. See docs/dev/desktop.md#steam-sign-in.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	const account = await requireAccount(db, locals);
	if (!(await throttle(db, 'steam', account._id))) {
		return json({ error: 'Too many tries. Wait a few minutes, then try again' }, { status: 429 });
	}
	const checked = await verifySteamTicket(steamConfig(), body.ticket, body.steamId);
	if ('error' in checked) return json({ error: STEAM_ERRORS[checked.error] }, { status: 400 });
	const failed = await linkSteam(db, account._id, {
		id: checked.steamId,
		persona: cleanPersona(body.persona)
	});
	if (failed) return json({ error: ACCOUNT_ERRORS[failed] }, { status: 400 });
	return json(await accountView(db, (await getAccount(db, account._id)) ?? account));
};

/** Unlink Steam: refused when it is the only way the account signs in. */
export const DELETE: RequestHandler = async ({ locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	if ((await unlinkSteam(db, account._id)) === 'noOtherWay') {
		return json(
			{ error: 'Add an email and password first, or you would have no way to sign in' },
			{ status: 400 }
		);
	}
	return json(await accountView(db, (await getAccount(db, account._id)) ?? account));
};
