import { getAccount, redeemTicket } from '../src/lib/server/store/accounts.ts';
import { getDb } from './db.ts';
import { log } from './log.ts';

/** Who a connection is: resolved from the ticket in its `hello`. */
export interface Identity {
	account: string;
	explorer: string;
	gamerTag: string;
}

/**
 * Who a ticket belongs to. The site gives a signed-in browser a ticket (`/api/ticket`), stored in
 * MongoDB, which both processes share. Null without a database or for a bad or expired ticket.
 * See docs/dev/accounts.md.
 */
export async function identify(ticket: unknown): Promise<Identity | null> {
	const db = getDb();
	if (!db) return null;
	try {
		const found = await redeemTicket(db, ticket);
		if (!found) return null;
		return {
			account: found.account._id,
			explorer: found.explorer._id,
			gamerTag: found.account.gamerTag
		};
	} catch (error) {
		log.warn(`Could not check a ticket: ${(error as Error).message}`);
		return null;
	}
}

/** An account's gamer tag as it is now (it can be changed on the site while connected). */
export async function currentTag(account: string): Promise<string | null> {
	const db = getDb();
	if (!db) return null;
	try {
		return (await getAccount(db, account))?.gamerTag ?? null;
	} catch (error) {
		log.warn(`Could not read a gamer tag: ${(error as Error).message}`);
		return null;
	}
}
