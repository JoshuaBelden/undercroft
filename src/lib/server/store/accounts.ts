import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import { ACCOUNT, cleanEmail, cleanTag } from '../../content/account.ts';
import type { AccountView, ExplorerView } from '../../shared/account/types.ts';
import { emptyInventory } from '../../shared/items/inventory.ts';
import type { Inventory, ItemStack } from '../../shared/player/types.ts';

/**
 * Accounts, sessions, game tickets and explorers in MongoDB. Used by the SvelteKit server (sign-in,
 * the hub) and by the game server (who is connecting, what they carry), so everything here takes
 * the `Db` and imports by relative path. See docs/dev/accounts.md.
 */

export interface AccountDoc {
	_id: string;
	/** Lower-cased; unique. */
	email: string;
	/** `scrypt$<salt>$<hash>`, both hex. */
	password: string;
	/** The name other players see. */
	gamerTag: string;
	/** Lower-cased gamer tag; unique, so two tags can't differ only by case. */
	tagKey: string;
	createdAt: Date;
}

/** The character an account plays. One per account today; nothing assumes only one. */
export interface ExplorerDoc {
	_id: string;
	account: string;
	money: number;
	/** What is kept on the surface. */
	stash: ItemStack[];
	/** What goes down on the next descent. */
	loadout: Inventory;
	/** Session id of the expedition they are in; the hub can't change anything while it is set. */
	underground: string | null;
	createdAt: Date;
}

interface SessionDoc {
	_id: string;
	account: string;
	expires: Date;
}

/** Rite progress as `server/progress.ts` stores it. */
interface ProgressDoc {
	_id: string;
	player: string;
	affliction: string;
	clues?: number;
	resolved?: boolean;
}

export type AccountError = 'email' | 'password' | 'tag' | 'emailTaken' | 'tagTaken';

export const ACCOUNT_ERRORS: Record<AccountError, string> = {
	email: 'Enter a valid email address',
	password: `Passwords need at least ${ACCOUNT.passwordMin} characters`,
	tag: `Gamer tags are ${ACCOUNT.tagMin} to ${ACCOUNT.tagMax} letters, numbers, spaces, - or _`,
	emailTaken: 'That email already has an account',
	tagTaken: 'That gamer tag is taken'
};

const accounts = (db: Db): Collection<AccountDoc> => db.collection<AccountDoc>('accounts');
const explorers = (db: Db): Collection<ExplorerDoc> => db.collection<ExplorerDoc>('explorers');
const sessions = (db: Db): Collection<SessionDoc> => db.collection<SessionDoc>('sessions');
const tickets = (db: Db): Collection<SessionDoc> => db.collection<SessionDoc>('tickets');

/** Create the indexes these collections rely on. Safe to call on every start. */
export async function ensureIndexes(db: Db): Promise<void> {
	await accounts(db).createIndex({ email: 1 }, { unique: true });
	await accounts(db).createIndex({ tagKey: 1 }, { unique: true });
	await explorers(db).createIndex({ account: 1 });
	// MongoDB removes these itself once they expire.
	await sessions(db).createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
	await tickets(db).createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
}

export async function createAccount(
	db: Db,
	input: { email: unknown; password: unknown; gamerTag: unknown }
): Promise<{ account: AccountDoc } | { error: AccountError }> {
	const email = cleanEmail(input.email);
	const gamerTag = cleanTag(input.gamerTag);
	if (!email) return { error: 'email' };
	if (typeof input.password !== 'string' || input.password.length < ACCOUNT.passwordMin) {
		return { error: 'password' };
	}
	if (!gamerTag) return { error: 'tag' };
	const account: AccountDoc = {
		_id: randomUUID(),
		email,
		password: await hashPassword(input.password),
		gamerTag,
		tagKey: gamerTag.toLowerCase(),
		createdAt: new Date()
	};
	try {
		await accounts(db).insertOne(account);
	} catch (error) {
		const taken = duplicate(error);
		if (taken) return { error: taken };
		throw error;
	}
	await explorerFor(db, account._id);
	return { account };
}

/** The account for this email and password, or null. */
export async function verifyLogin(
	db: Db,
	email: unknown,
	password: unknown
): Promise<AccountDoc | null> {
	const cleaned = cleanEmail(email);
	if (!cleaned || typeof password !== 'string') return null;
	const account = await accounts(db).findOne({ email: cleaned });
	if (!account || !(await checkPassword(password, account.password))) return null;
	return account;
}

export async function setGamerTag(
	db: Db,
	accountId: string,
	tag: unknown
): Promise<{ gamerTag: string } | { error: AccountError }> {
	const gamerTag = cleanTag(tag);
	if (!gamerTag) return { error: 'tag' };
	try {
		await accounts(db).updateOne(
			{ _id: accountId },
			{ $set: { gamerTag, tagKey: gamerTag.toLowerCase() } }
		);
	} catch (error) {
		const taken = duplicate(error);
		if (taken) return { error: taken };
		throw error;
	}
	return { gamerTag };
}

export async function getAccount(db: Db, accountId: string): Promise<AccountDoc | null> {
	return accounts(db).findOne({ _id: accountId });
}

/** Start a browser session; returns the cookie value. */
export async function createSession(db: Db, accountId: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	await sessions(db).insertOne({
		_id: token,
		account: accountId,
		expires: new Date(Date.now() + ACCOUNT.sessionDays * 86400_000)
	});
	return token;
}

export async function sessionAccount(db: Db, token: string): Promise<AccountDoc | null> {
	const session = await sessions(db).findOne({ _id: token, expires: { $gt: new Date() } });
	return session ? getAccount(db, session.account) : null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
	await sessions(db).deleteOne({ _id: token });
}

/**
 * A ticket lets the browser prove who it is to the game server, which can't see the session
 * cookie. It can be used again until it expires, so a dropped connection can reconnect with it.
 */
export async function createTicket(db: Db, accountId: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	await tickets(db).insertOne({
		_id: token,
		account: accountId,
		expires: new Date(Date.now() + ACCOUNT.ticketHours * 3600_000)
	});
	return token;
}

/** Who a ticket belongs to: the account and its explorer. Null if it is unknown or expired. */
export async function redeemTicket(
	db: Db,
	token: unknown
): Promise<{ account: AccountDoc; explorer: ExplorerDoc } | null> {
	if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
	const ticket = await tickets(db).findOne({ _id: token, expires: { $gt: new Date() } });
	const account = ticket ? await getAccount(db, ticket.account) : null;
	if (!account) return null;
	return { account, explorer: await explorerFor(db, account._id) };
}

/** The account's explorer, created with nothing the first time it is asked for. */
export async function explorerFor(db: Db, accountId: string): Promise<ExplorerDoc> {
	const existing = await explorers(db).findOne({ account: accountId });
	if (existing) return existing;
	const explorer: ExplorerDoc = {
		_id: randomUUID(),
		account: accountId,
		money: 0,
		stash: [],
		loadout: emptyInventory(),
		underground: null,
		createdAt: new Date()
	};
	await explorers(db).insertOne(explorer);
	return explorer;
}

/** Everything the browser may know about an account. */
export async function accountView(db: Db, account: AccountDoc): Promise<AccountView> {
	const explorer = await explorerFor(db, account._id);
	const progress = await db
		.collection<ProgressDoc>('progress')
		.find({ player: explorer._id })
		.toArray();
	const view: ExplorerView = {
		id: explorer._id,
		money: explorer.money,
		stash: explorer.stash,
		loadout: explorer.loadout,
		underground: explorer.underground !== null,
		afflictions: progress.map((doc) => ({
			id: doc.affliction,
			clues: doc.clues ?? 0,
			resolved: doc.resolved === true
		}))
	};
	return { id: account._id, email: account.email, gamerTag: account.gamerTag, explorer: view };
}

function hash(password: string, salt: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
	});
}

async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	return `scrypt$${salt.toString('hex')}$${(await hash(password, salt)).toString('hex')}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, salt, expected] = stored.split('$');
	if (scheme !== 'scrypt' || !salt || !expected) return false;
	const actual = await hash(password, Buffer.from(salt, 'hex'));
	const wanted = Buffer.from(expected, 'hex');
	return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/** Which unique field a failed write collided on, if that is why it failed. */
function duplicate(error: unknown): AccountError | null {
	if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) {
		return null;
	}
	return String((error as { message?: unknown }).message).includes('tagKey')
		? 'tagTaken'
		: 'emailTaken';
}
