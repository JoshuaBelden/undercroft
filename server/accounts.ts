import { explorerFor, getAccount, redeemTicket } from '../src/lib/server/store/accounts.ts';
import { cleanLook, type Look } from '../src/lib/shared/player/look.ts';
import { accountAvatar } from '../src/lib/server/store/avatars.ts';
import { getDb } from './db.ts';
import { log } from './log.ts';

/** How a player shows to others: their gamer tag, avatar and explorer's look. */
export interface Profile {
	gamerTag: string;
	/** Their avatar's URL, or null for none. */
	avatar: string | null;
	/** How their explorer is dressed (docs/dev/player.md#the-look); absent, the default look. */
	look?: Look;
}

/** Who a connection is: resolved from the ticket in its `hello`. */
export interface Identity extends Profile {
	account: string;
	explorer: string;
	/**
	 * A co-op guest on a desktop game (docs/dev/hosting.md): known by their SteamID, with their
	 * belongings in their own save (server/guests.ts), and no account in this server's database.
	 */
	remote?: boolean;
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
			gamerTag: found.account.gamerTag,
			avatar: accountAvatar(found.account),
			look: cleanLook(found.explorer.look)
		};
	} catch (error) {
		log.warn(`Could not check a ticket: ${(error as Error).message}`);
		return null;
	}
}

/** An account's gamer tag, avatar and look as they are now (each can be changed on the site while connected). */
export async function currentProfile(account: string): Promise<Profile | null> {
	const db = getDb();
	if (!db) return null;
	try {
		const found = await getAccount(db, account);
		if (!found) return null;
		const explorer = await explorerFor(db, found._id);
		return {
			gamerTag: found.gamerTag,
			avatar: accountAvatar(found),
			look: cleanLook(explorer.look)
		};
	} catch (error) {
		log.warn(`Could not read a profile: ${(error as Error).message}`);
		return null;
	}
}
