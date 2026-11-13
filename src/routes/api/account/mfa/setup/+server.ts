import { json } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { beginTotpSetup } from '#lib/server/store/auth.ts';
import { otpauthUrl } from '#lib/server/totp.ts';
import type { RequestHandler } from './$types';

/**
 * Start turning two-step sign-in on: a new secret, as a QR code to scan and as text to type.
 * Nothing changes until a code from it is sent to `/api/account/mfa/enable`.
 */
export const POST: RequestHandler = async ({ locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	if (account.totp) return json({ error: 'Two-step sign-in is already on' }, { status: 400 });
	const secret = await beginTotpSetup(db, account._id);
	const qr = await QRCode.toString(otpauthUrl(secret, account.email), {
		type: 'svg',
		margin: 1,
		color: { dark: '#000000', light: '#ffffff' }
	});
	return json({ secret, qr });
};
