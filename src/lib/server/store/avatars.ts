import { Binary, type Collection, type Db } from 'mongodb';
import { avatarUrl } from '../../shared/account/avatar.ts';
import type { AccountDoc } from './accounts.ts';

/**
 * Avatars players upload, in MongoDB (docs/dev/accounts.md#avatars). The picture is in `avatars`,
 * keyed by account; the account keeps its version (`AccountDoc.avatar`), which goes in the URL,
 * so knowing an account's avatar never means reading the picture.
 */

export interface AvatarDoc {
	/** The account id. */
	_id: string;
	/** WebP, already checked and scaled (src/lib/server/avatarImage.ts). */
	image: Binary;
	version: number;
	updatedAt: Date;
}

const avatars = (db: Db): Collection<AvatarDoc> => db.collection<AvatarDoc>('avatars');
const accounts = (db: Db): Collection<AccountDoc> => db.collection<AccountDoc>('accounts');

/** The avatar to show for this account: its upload, else its Discord avatar, else null. */
export const accountAvatar = (account: AccountDoc): string | null =>
	avatarUrl({ id: account._id, upload: account.avatar, discord: account.discord });

/** Keep a new uploaded avatar for the account, in place of any before it. Returns its version. */
export async function saveAvatar(db: Db, accountId: string, image: Uint8Array): Promise<number> {
	// Milliseconds: a new number for each upload, so browsers never show the old picture.
	const version = Date.now();
	await avatars(db).replaceOne(
		{ _id: accountId },
		{ image: new Binary(image), version, updatedAt: new Date() },
		{ upsert: true }
	);
	await accounts(db).updateOne({ _id: accountId }, { $set: { avatar: version } });
	return version;
}

/** Remove the account's uploaded avatar (a Discord one shows instead). False if there was none. */
export async function removeAvatar(db: Db, accountId: string): Promise<boolean> {
	const removed = await avatars(db).deleteOne({ _id: accountId });
	const unset = await accounts(db).updateOne(
		{ _id: accountId, avatar: { $exists: true } },
		{ $unset: { avatar: '' } }
	);
	return removed.deletedCount > 0 || unset.modifiedCount > 0;
}

/** The uploaded avatar's picture (WebP), or null. */
export async function avatarImage(db: Db, accountId: string): Promise<Uint8Array | null> {
	const doc = await avatars(db).findOne({ _id: accountId });
	return doc ? doc.image.buffer : null;
}
