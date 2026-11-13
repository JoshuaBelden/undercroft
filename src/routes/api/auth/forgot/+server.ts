import { json } from '@sveltejs/kit';
import { cleanEmail } from '#lib/content/account.ts';
import { database } from '#lib/server/db.ts';
import { resetMail, sendMail } from '#lib/server/mail.ts';
import { requestReset, throttle } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/**
 * Email a password-reset link. Body: `{ email }`. The answer is the same whether or not the email
 * has an account, so this can't be used to find out who plays.
 */
export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const email = cleanEmail(body.email);
	if (!email) return json({ error: 'Enter a valid email address' }, { status: 400 });
	const db = await database();
	const allowed =
		(await throttle(db, 'forgotFromAddress', getClientAddress())) &&
		(await throttle(db, 'forgot', email));
	if (!allowed) {
		return json({ error: 'Too many requests. Try again in an hour' }, { status: 429 });
	}
	const reset = await requestReset(db, email);
	if (reset) {
		const link = `${url.origin}/auth/reset?token=${reset.token}`;
		try {
			await sendMail({ to: reset.account.email, ...resetMail(link) });
		} catch (error) {
			console.error('[forgot]', error);
			return json({ error: 'The email could not be sent. Try again later' }, { status: 502 });
		}
	}
	return json({ ok: true });
};
