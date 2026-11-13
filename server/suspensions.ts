import { suspendedAmong } from '../src/lib/server/store/accounts.ts';
import { getDb } from './db.ts';
import { log } from './log.ts';
import type { Parties } from './parties.ts';

/** How often everyone connected is checked against suspensions. */
const CHECK_SECONDS = 60;

/**
 * Suspensions are set in the admin app, which only talks to MongoDB. A suspended account can't
 * get a new ticket or sign in again, and this closes a connection that is already open: within a
 * minute, they are out of their party and expedition. See docs/dev/admin.md#suspending.
 */
export function watchSuspensions(parties: Parties): () => void {
	const timer = setInterval(() => void check(parties), CHECK_SECONDS * 1000);
	return () => clearInterval(timer);
}

async function check(parties: Parties): Promise<void> {
	const db = getDb();
	if (!db) return;
	try {
		const suspended = await suspendedAmong(db, parties.accounts());
		for (const [account, reason] of suspended) parties.expel(account, reason);
	} catch (error) {
		log.warn(`Could not check suspensions: ${(error as Error).message}`);
	}
}
