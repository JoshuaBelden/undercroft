import type { Db } from 'mongodb';
import { DELETED_ACCOUNT } from '../../content/account.ts';
import type { AccountDoc, ExplorerDoc } from './accounts.ts';

/**
 * Deleting an account, for good: by an admin (the member page in the admin app) or by the player
 * (the Account screen). See docs/dev/accounts.md#deleting-an-account.
 *
 * Removed: the account, its sessions, game and admin tickets, reset links and two-step
 * challenges, its explorers (stash, loadout, ledger, rite progress), its friendships and friend
 * requests (both sides), its uploaded avatar, and its votes on ideas (each idea's count goes down to match).
 *
 * Kept, with nothing that says who: bug reports, ideas and feedback it wrote (shown as
 * `DELETED_ACCOUNT`), and the runs its explorers logged (they name only the explorer id, which no
 * longer leads anywhere), so the stats stay whole.
 *
 * The game server notices within a minute (server/suspensions.ts): a player still connected is
 * sent away, and friends who are online lose them from their lists.
 */
export async function deleteAccount(db: Db, accountId: string): Promise<AccountDoc | null> {
	const account = await db.collection<AccountDoc>('accounts').findOneAndDelete({ _id: accountId });
	if (!account) return null;
	const owned = { account: accountId };

	// Signed out of everything at once.
	for (const name of ['sessions', 'tickets', 'adminSessions', 'resets', 'challenges']) {
		await db.collection<{ account: string }>(name).deleteMany(owned);
	}

	const explorers = await db.collection<ExplorerDoc>('explorers').find(owned).toArray();
	const explorerIds = explorers.map((explorer) => explorer._id);
	await db.collection<{ player: string }>('progress').deleteMany({ player: { $in: explorerIds } });
	await db
		.collection<{ explorer: string }>('ledger')
		.deleteMany({ explorer: { $in: explorerIds } });
	await db.collection<ExplorerDoc>('explorers').deleteMany(owned);

	await db.collection<{ accounts: string[] }>('friends').deleteMany({ accounts: accountId });
	await db.collection<{ _id: string }>('avatars').deleteOne({ _id: accountId });

	const votes = db.collection<{ _id: string; idea: string; account: string }>('ideaVotes');
	const voted = await votes.find(owned).toArray();
	if (voted.length > 0) {
		await votes.deleteMany(owned);
		await db.collection<{ _id: string; votes: number }>('ideas').bulkWrite(
			voted.map((vote) => ({
				updateOne: { filter: { _id: vote.idea }, update: { $inc: { votes: -1 } } }
			}))
		);
	}

	const anonymous = { account: DELETED_ACCOUNT.id, gamerTag: DELETED_ACCOUNT.gamerTag };
	await db.collection('reports').updateMany(owned, { $set: anonymous });
	await db.collection('feedback').updateMany(owned, { $set: anonymous });
	await db
		.collection('ideas')
		.updateMany(
			{ author: accountId },
			{ $set: { author: DELETED_ACCOUNT.id, authorTag: DELETED_ACCOUNT.gamerTag } }
		);
	return account;
}

/**
 * Which of these accounts no longer exist. The game server asks about everyone connected, and
 * everyone on their friend lists, to catch accounts deleted since they were read.
 */
export async function deletedAmong(db: Db, ids: string[]): Promise<string[]> {
	if (ids.length === 0) return [];
	const found = await db
		.collection<AccountDoc>('accounts')
		.find({ _id: { $in: ids } }, { projection: { _id: 1 } })
		.toArray();
	const present = new Set(found.map((account) => account._id));
	return ids.filter((id) => !present.has(id));
}
