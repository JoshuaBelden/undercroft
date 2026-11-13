import { suspendedAmong } from '../src/lib/server/store/accounts.ts';
import { deletedAmong } from '../src/lib/server/store/deletion.ts';
import { getDb } from './db.ts';
import { log } from './log.ts';
import type { Parties } from './parties.ts';
import type { Social } from './social.ts';

/** How often everyone connected is checked against suspensions and deletions. */
const CHECK_SECONDS = 60;

/** What a player whose account was deleted while they were connected is told. */
const DELETED_MESSAGE = 'This account was deleted';

/**
 * Suspensions and deletions are made in the admin app (or, for a deletion, on the Account
 * screen), which only talk to MongoDB. A suspended or deleted account can't get a new ticket or
 * sign in again, and this closes a connection that is already open: within a minute, they are
 * out of their party and expedition. A deleted account also leaves the lists of friends who are
 * online. See docs/dev/admin.md#suspending and docs/dev/accounts.md#deleting-an-account.
 */
export function watchSuspensions(parties: Parties, social: Social): () => void {
	const timer = setInterval(() => void check(parties, social), CHECK_SECONDS * 1000);
	return () => clearInterval(timer);
}

async function check(parties: Parties, social: Social): Promise<void> {
	const db = getDb();
	if (!db) return;
	try {
		const here = parties.accounts();
		const suspended = await suspendedAmong(db, here);
		for (const [account, reason] of suspended) parties.expel(account, reason);
		const deleted = await deletedAmong(db, [...new Set([...here, ...social.listed()])]);
		if (deleted.length === 0) return;
		for (const account of deleted) parties.expel(account, DELETED_MESSAGE);
		await social.forget(deleted);
	} catch (error) {
		log.warn(`Could not check suspensions: ${(error as Error).message}`);
	}
}
