import type { Collection, Db } from 'mongodb';
import type { AccountDoc } from './accounts.ts';

/**
 * Who is friends with whom, in MongoDB. One document per pair of accounts: a request while it is
 * `pending`, a friendship once the other side accepts. Used by the game server
 * (server/social.ts). See docs/dev/social.md.
 */

export interface FriendDoc {
	/** The two account ids, sorted and joined: one document per pair, whoever asked. */
	_id: string;
	/** The two accounts, in the same order as in `_id`. */
	accounts: [string, string];
	/** Who asked. */
	requester: string;
	status: 'pending' | 'accepted';
	createdAt: Date;
}

/** Another account: its id and gamer tag. */
export interface Tagged {
	account: string;
	name: string;
}

/** Everyone an account has something to do with. */
export interface Friendships {
	friends: Tagged[];
	/** They asked; this account has not answered. */
	incoming: Tagged[];
	/** This account asked; they have not answered. */
	outgoing: Tagged[];
}

export type FriendError = 'self' | 'missing' | 'already';

export const FRIEND_ERRORS: Record<FriendError, string> = {
	self: "You can't add yourself",
	missing: 'No such player',
	already: "You're already friends"
};

const friends = (db: Db): Collection<FriendDoc> => db.collection<FriendDoc>('friends');
const accounts = (db: Db): Collection<AccountDoc> => db.collection<AccountDoc>('accounts');

const pairId = (a: string, b: string): string => [a, b].sort().join(':');

export async function ensureFriendIndexes(db: Db): Promise<void> {
	await friends(db).createIndex({ accounts: 1 });
}

/** Everyone `account` is friends with, has asked, or has been asked by, with their gamer tags. */
export async function friendsOf(db: Db, account: string): Promise<Friendships> {
	const docs = await friends(db).find({ accounts: account }).toArray();
	const other = (doc: FriendDoc): string =>
		doc.accounts[0] === account ? doc.accounts[1] : doc.accounts[0];
	const tags = new Map<string, string>();
	const found = await accounts(db)
		.find({ _id: { $in: docs.map(other) } }, { projection: { gamerTag: 1 } })
		.toArray();
	for (const doc of found) tags.set(doc._id, doc.gamerTag);

	const result: Friendships = { friends: [], incoming: [], outgoing: [] };
	for (const doc of docs) {
		const name = tags.get(other(doc));
		// An account that is gone: nothing to show.
		if (name === undefined) continue;
		const entry = { account: other(doc), name };
		if (doc.status === 'accepted') result.friends.push(entry);
		else if (doc.requester === account) result.outgoing.push(entry);
		else result.incoming.push(entry);
	}
	const byName = (a: Tagged, b: Tagged): number => a.name.localeCompare(b.name);
	result.friends.sort(byName);
	result.incoming.sort(byName);
	result.outgoing.sort(byName);
	return result;
}

/** Whether the two accounts are friends (an accepted request). */
export async function areFriends(db: Db, a: string, b: string): Promise<boolean> {
	return (await friends(db).countDocuments({ _id: pairId(a, b), status: 'accepted' })) === 1;
}

/**
 * `from` asks `to` to be friends. If `to` had already asked `from`, that is an answer: they are
 * friends now.
 */
export async function requestFriend(db: Db, from: string, to: string): Promise<FriendError | null> {
	if (from === to) return 'self';
	if ((await accounts(db).countDocuments({ _id: to })) === 0) return 'missing';
	const id = pairId(from, to);
	const existing = await friends(db).findOne({ _id: id });
	if (existing?.status === 'accepted') return 'already';
	if (existing) {
		if (existing.requester !== from) {
			await friends(db).updateOne({ _id: id }, { $set: { status: 'accepted' } });
		}
		return null;
	}
	const [first, second] = [from, to].sort();
	try {
		await friends(db).insertOne({
			_id: id,
			accounts: [first, second],
			requester: from,
			status: 'pending',
			createdAt: new Date()
		});
	} catch (error) {
		// Both asked at the same moment: the other request is there now, and this one answers it.
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
			return requestFriend(db, from, to);
		}
		throw error;
	}
	return null;
}

/** `account` accepts the request `from` sent them. False if there was none. */
export async function acceptFriend(db: Db, account: string, from: string): Promise<boolean> {
	const result = await friends(db).updateOne(
		{ _id: pairId(account, from), requester: from, status: 'pending' },
		{ $set: { status: 'accepted' } }
	);
	return result.matchedCount === 1;
}

/**
 * End whatever is between the two accounts: turn down or take back a request, or stop being
 * friends. False if there was nothing.
 */
export async function removeFriend(db: Db, a: string, b: string): Promise<boolean> {
	return (await friends(db).deleteOne({ _id: pairId(a, b) })).deletedCount === 1;
}

/** Accounts whose gamer tag starts with `query` (any case), except `except`. */
export async function searchTags(
	db: Db,
	query: string,
	except: string,
	limit: number
): Promise<Tagged[]> {
	const prefix = query.trim().toLowerCase();
	if (!prefix) return [];
	const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const found = await accounts(db)
		.find(
			{ tagKey: { $regex: `^${escaped}` }, _id: { $ne: except } },
			{ projection: { gamerTag: 1 } }
		)
		.sort({ tagKey: 1 })
		.limit(limit)
		.toArray();
	return found.map((doc) => ({ account: doc._id, name: doc.gamerTag }));
}
