import { json } from '@sveltejs/kit';
import { AVATAR } from '#lib/content/account.ts';
import { processAvatar } from '#lib/server/avatarImage.ts';
import { database } from '#lib/server/db.ts';
import { requireAccount } from '#lib/server/session.ts';
import { accountView, getAccount } from '#lib/server/store/accounts.ts';
import { throttle } from '#lib/server/store/auth.ts';
import { removeAvatar, saveAvatar } from '#lib/server/store/avatars.ts';
import type { RequestHandler } from './$types';

/**
 * A new avatar: the body is the picture itself, as the Account screen's crop editor made it
 * (docs/dev/accounts.md#avatars). It is decoded and stored again as a small WebP. Answers with
 * the `AccountView`.
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	if (!(await throttle(db, 'avatar', account._id))) {
		return json({ error: 'Too many new pictures. Wait a while' }, { status: 429 });
	}
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength > AVATAR.maxUploadBytes) {
		return json({ error: 'That picture is too big' }, { status: 413 });
	}
	const image = await processAvatar(bytes);
	if (!image) return json({ error: "That doesn't look like a picture" }, { status: 400 });
	await saveAvatar(db, account._id, image);
	return json(await accountView(db, (await getAccount(db, account._id)) ?? account));
};

/** Remove the uploaded avatar: a linked Discord account's avatar shows again, or none. */
export const DELETE: RequestHandler = async ({ locals }) => {
	const db = await database();
	const account = await requireAccount(db, locals);
	await removeAvatar(db, account._id);
	return json(await accountView(db, (await getAccount(db, account._id)) ?? account));
};
