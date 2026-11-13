import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db.ts';
import { ACCOUNT_ERRORS } from '#lib/server/store/accounts.ts';
import { consumeReset } from '#lib/server/store/auth.ts';
import type { RequestHandler } from './$types';

/** Set a new password from an emailed link. Body: `{ token, password }`. Signs out everywhere. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const failed = await consumeReset(await database(), body.token, body.password);
	if (failed === 'expired') {
		return json(
			{ error: 'This link has expired or was already used. Ask for a new one' },
			{ status: 400 }
		);
	}
	if (failed) return json({ error: ACCOUNT_ERRORS[failed] }, { status: 400 });
	return json({ ok: true });
};
