import { json } from '@sveltejs/kit';
import { ACCOUNT } from '#lib/content/account.ts';
import { database } from '#lib/server/db.ts';
import { setStepCookie, signIn, SIGNUP_COOKIE, steamConfig } from '#lib/server/session.ts';
import { cleanPersona, STEAM_ERRORS, verifySteamTicket } from '#lib/server/steam.ts';
import {
	accountBySteam,
	refreshSteam,
	startSteamSignup,
	throttle
} from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/**
 * "Continue with Steam", from the desktop app. Body: `{ ticket, steamId, persona }`: a Web API
 * ticket from Steam, and who the app says the player is (`steamId` is only believed in trusted
 * local testing; `persona` is their Steam name, only ever shown). Answers `{ ok: true }` when
 * signed in, `{ mfa: true }` for a two-step code next, or `{ signup: true, suggest }` for someone
 * new, who chooses a gamer tag at `/auth/steam/tag`. See docs/dev/desktop.md#steam-sign-in.
 */
export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const db = await database();
	if (!(await throttle(db, 'steam', getClientAddress()))) {
		return json({ error: 'Too many tries. Wait a few minutes, then try again' }, { status: 429 });
	}
	const checked = await verifySteamTicket(steamConfig(), body.ticket, body.steamId);
	if ('error' in checked) {
		const status = checked.error === 'off' ? 404 : checked.error === 'unreachable' ? 502 : 401;
		return json({ error: STEAM_ERRORS[checked.error] }, { status });
	}
	const steam = { id: checked.steamId, persona: cleanPersona(body.persona) };
	const secure = url.protocol === 'https:';

	const linked = await accountBySteam(db, steam.id);
	if (linked) {
		await refreshSteam(db, linked._id, steam);
		const result = await signIn(db, cookies, linked, secure);
		if (typeof result === 'object') return json({ error: result.suspended }, { status: 403 });
		return json(result === 'mfa' ? { mfa: true } : { ok: true });
	}

	const signup = await startSteamSignup(db, steam);
	setStepCookie(cookies, SIGNUP_COOKIE, signup, ACCOUNT.signupMinutes, secure);
	return json({ signup: true, suggest: steam.persona });
};
