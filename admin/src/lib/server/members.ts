import type { Db, WithId } from 'mongodb';
import type { AccountDoc, ExplorerDoc, LedgerDoc } from './store.ts';
import { ADMIN } from './store.ts';

/**
 * Looking up members for the admin app: search and one member's whole picture. Changes to an
 * account go through the game's store (src/lib/server/store) from the member page's actions.
 */

/** A row of the member list. */
export interface MemberRow {
	id: string;
	gamerTag: string;
	email: string;
	discord: string | null;
	admin: boolean;
	suspended: boolean;
	createdAt: Date | null;
	lastSeen: Date | null;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Members whose email, gamer tag or Discord name contains `query`; the newest first. */
export async function searchMembers(db: Db, query: string): Promise<MemberRow[]> {
	const text = query.trim();
	const pattern = new RegExp(escape(text), 'i');
	const filter = text
		? { $or: [{ email: pattern }, { tagKey: pattern }, { 'discord.username': pattern }] }
		: {};
	const docs = await db
		.collection<AccountDoc>('accounts')
		.find(filter)
		.sort({ createdAt: -1 })
		.limit(ADMIN.pageSize)
		.toArray();
	return docs.map(memberRow);
}

export function memberRow(account: AccountDoc): MemberRow {
	return {
		id: account._id,
		gamerTag: account.gamerTag,
		email: account.email,
		discord: account.discord?.username ?? null,
		admin: account.role === 'admin',
		suspended: Boolean(
			account.suspended && (!account.suspended.until || account.suspended.until > new Date())
		),
		createdAt: account.createdAt ?? null,
		lastSeen: account.lastSeen ?? null
	};
}

/** How many browsers the account is signed in on now. */
export async function sessionCount(db: Db, accountId: string): Promise<number> {
	return db
		.collection<{ _id: string; account: string; expires: Date }>('sessions')
		.countDocuments({ account: accountId, expires: { $gt: new Date() } });
}

/** The account's explorers (one today) and the last lines of their ledger. */
export async function explorersOf(
	db: Db,
	accountId: string
): Promise<{ explorers: ExplorerDoc[]; ledger: WithId<LedgerDoc>[] }> {
	const explorers = await db
		.collection<ExplorerDoc>('explorers')
		.find({ account: accountId })
		.toArray();
	const ledger = await db
		.collection<LedgerDoc>('ledger')
		.find({ explorer: { $in: explorers.map((explorer) => explorer._id) } })
		.sort({ at: -1 })
		.limit(25)
		.toArray();
	return { explorers, ledger };
}
