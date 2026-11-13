import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import { ACCOUNT, cleanEmail, cleanTag } from '../../content/account.ts';
import type { AccountView, ExplorerView } from '../../shared/account/types.ts';
import { SLOTS } from '../../content/items.ts';
import {
	addToSlots,
	emptyInventory,
	emptySlots,
	type Slots
} from '../../shared/items/inventory.ts';
import type { Inventory, ItemStack } from '../../shared/player/types.ts';
import { ensureAdminIndexes } from './admin.ts';
import { ensureAuthIndexes } from './auth.ts';
import { ensureFeedbackIndexes } from './feedback.ts';
import { ensureFriendIndexes } from './friends.ts';
import { ensureReportIndexes } from './reports.ts';
import { ensureRunIndexes } from './runs.ts';

/**
 * Accounts, sessions, game tickets and explorers in MongoDB. Used by the SvelteKit server (sign-in,
 * the hub) and by the game server (who is connecting, what they carry), so everything here takes
 * the `Db` and imports by relative path. See docs/dev/accounts.md.
 */

export interface AccountDoc {
	_id: string;
	/** Lower-cased; unique. */
	email: string;
	/** `scrypt$<salt>$<hash>`, both hex. Missing on an account made with Discord until one is set. */
	password?: string;
	/** The name other players see. */
	gamerTag: string;
	/** Lower-cased gamer tag; unique, so two tags can't differ only by case. */
	tagKey: string;
	/** The Discord account it signs in with, if linked. `discord.id` is unique. */
	discord?: { id: string; username: string };
	/** Two-step sign-in, when it is on. */
	totp?: TotpDoc;
	/** A secret being set up: shown as a QR code, not in force until a code from it is entered. */
	totpPending?: string;
	/** Staff: an `admin` can sign in to the admin app (docs/dev/admin.md). */
	role?: 'admin';
	/** Set by an admin: no sign-in and no play while it is in force (see `activeSuspension`). */
	suspended?: SuspensionDoc;
	/** The last time a game ticket was issued: about the last time they played. */
	lastSeen?: Date;
	createdAt: Date;
}

export interface SuspensionDoc {
	/** Shown to the player when they try to sign in. */
	reason: string;
	/** When it lifts by itself; missing: until an admin lifts it. */
	until?: Date;
	/** The admin's account id. */
	by: string;
	at: Date;
}

/** The account's suspension, if it is in force now. One whose end date has passed is not. */
export function activeSuspension(account: AccountDoc, now = new Date()): SuspensionDoc | null {
	const suspension = account.suspended;
	if (!suspension) return null;
	return suspension.until && suspension.until <= now ? null : suspension;
}

/** A suspension as the player is told it. */
export function suspensionMessage(suspension: SuspensionDoc): string {
	const until = suspension.until
		? ` until ${suspension.until.toISOString().slice(0, 16).replace('T', ' ')} UTC`
		: '';
	return `This account is suspended${until}: ${suspension.reason}`;
}

export interface TotpDoc {
	/** Base32 (see src/lib/server/totp.ts). */
	secret: string;
	enabledAt: Date;
	/** sha256 (hex) of each recovery code not yet used. */
	recovery: string[];
	/** The last time step a code was accepted for, so one code can't be used twice. */
	usedStep: number;
}

/** The character an account plays. One per account today; nothing assumes only one. */
export interface ExplorerDoc {
	_id: string;
	account: string;
	money: number;
	/** What is kept on the surface: one entry per stash slot (more slots can be added later). */
	stash: Slots;
	/** What goes down on the next descent. */
	loadout: Inventory;
	/** How the stash and loadout are stored (see `upgrade`). */
	layout: typeof LAYOUT;
	/** Session id of the expedition they are in; the hub can't change anything while it is set. */
	underground: string | null;
	/**
	 * Ready to descend with their party: the hub can't change anything while it is set, so what
	 * they confirmed is what goes down. Set and cleared by the game server.
	 */
	ready?: boolean;
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

export type AccountError =
	'email' | 'password' | 'tag' | 'emailTaken' | 'tagTaken' | 'discordTaken';

export const ACCOUNT_ERRORS: Record<AccountError, string> = {
	email: 'Enter a valid email address',
	password: `Passwords need at least ${ACCOUNT.passwordMin} characters`,
	tag: `Gamer tags are ${ACCOUNT.tagMin} to ${ACCOUNT.tagMax} letters, numbers, spaces, - or _`,
	emailTaken: 'That email already has an account',
	tagTaken: 'That gamer tag is taken',
	discordTaken: 'That Discord account is already linked to another Undercroft account'
};

/** The stash and loadout are slots. Explorers from before that are converted when next read. */
const LAYOUT = 2;

const accounts = (db: Db): Collection<AccountDoc> => db.collection<AccountDoc>('accounts');
const explorers = (db: Db): Collection<ExplorerDoc> => db.collection<ExplorerDoc>('explorers');
const sessions = (db: Db): Collection<SessionDoc> => db.collection<SessionDoc>('sessions');
const tickets = (db: Db): Collection<SessionDoc> => db.collection<SessionDoc>('tickets');

/** Create the indexes these collections rely on. Safe to call on every start. */
export async function ensureIndexes(db: Db): Promise<void> {
	await accounts(db).createIndex({ email: 1 }, { unique: true });
	await accounts(db).createIndex({ tagKey: 1 }, { unique: true });
	await accounts(db).createIndex({ 'discord.id': 1 }, { unique: true, sparse: true });
	await sessions(db).createIndex({ account: 1 });
	await explorers(db).createIndex({ account: 1 });
	// MongoDB removes these itself once they expire.
	await sessions(db).createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
	await tickets(db).createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
	await ensureFriendIndexes(db);
	await ensureAuthIndexes(db);
	await ensureAdminIndexes(db);
	await ensureReportIndexes(db);
	await ensureFeedbackIndexes(db);
	await ensureRunIndexes(db);
}

/**
 * A new account. It has a password, or a linked Discord account (whose email it takes), or both.
 */
export async function createAccount(
	db: Db,
	input: {
		email: unknown;
		password?: unknown;
		gamerTag: unknown;
		discord?: { id: string; username: string };
	}
): Promise<{ account: AccountDoc } | { error: AccountError }> {
	const email = cleanEmail(input.email);
	const gamerTag = cleanTag(input.gamerTag);
	if (!email) return { error: 'email' };
	if (!input.discord && !validPassword(input.password)) return { error: 'password' };
	if (input.password !== undefined && !validPassword(input.password)) return { error: 'password' };
	if (!gamerTag) return { error: 'tag' };
	const account: AccountDoc = {
		_id: randomUUID(),
		email,
		gamerTag,
		tagKey: gamerTag.toLowerCase(),
		createdAt: new Date()
	};
	if (typeof input.password === 'string') account.password = await hashPassword(input.password);
	if (input.discord) account.discord = input.discord;
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
	if (!account?.password || !(await checkPassword(password, account.password))) return null;
	return account;
}

/** Whether this is a password we'd accept for an account. */
export function validPassword(password: unknown): password is string {
	return typeof password === 'string' && password.length >= ACCOUNT.passwordMin;
}

/** Set the account's password (it may not have had one: made with Discord). */
export async function setAccountPassword(
	db: Db,
	accountId: string,
	password: unknown
): Promise<AccountError | null> {
	if (!validPassword(password)) return 'password';
	await accounts(db).updateOne(
		{ _id: accountId },
		{ $set: { password: await hashPassword(password) } }
	);
	return null;
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

/** Admin: set a new password for the account with this email. Returns why not, if it can't. */
export async function setPassword(
	db: Db,
	email: unknown,
	password: unknown
): Promise<AccountError | null> {
	const cleaned = cleanEmail(email);
	if (!cleaned) return 'email';
	if (!validPassword(password)) return 'password';
	const result = await accounts(db).updateOne(
		{ email: cleaned },
		{ $set: { password: await hashPassword(password) } }
	);
	return result.matchedCount === 1 ? null : 'email';
}

export async function getAccount(db: Db, accountId: string): Promise<AccountDoc | null> {
	return accounts(db).findOne({ _id: accountId });
}

/**
 * Suspend an account (admin): signed out of every browser and game ticket at once. The game
 * server closes a connection that is still open within a minute (server/suspensions.ts).
 */
export async function suspendAccount(
	db: Db,
	accountId: string,
	suspension: SuspensionDoc
): Promise<void> {
	await accounts(db).updateOne({ _id: accountId }, { $set: { suspended: suspension } });
	await deleteSessionsFor(db, accountId);
}

export async function liftSuspension(db: Db, accountId: string): Promise<void> {
	await accounts(db).updateOne({ _id: accountId }, { $unset: { suspended: '' } });
}

/**
 * Which of these accounts are suspended now, with what the player is told. The game server asks
 * about everyone connected, to close the connections of anyone an admin just suspended.
 */
export async function suspendedAmong(db: Db, ids: string[]): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	if (ids.length === 0) return found;
	const docs = await accounts(db)
		.find({ _id: { $in: ids }, suspended: { $exists: true } })
		.toArray();
	for (const account of docs) {
		const suspension = activeSuspension(account);
		if (suspension) found.set(account._id, suspensionMessage(suspension));
	}
	return found;
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

/** The account a browser session belongs to. None while the account is suspended. */
export async function sessionAccount(db: Db, token: string): Promise<AccountDoc | null> {
	const session = await sessions(db).findOne({ _id: token, expires: { $gt: new Date() } });
	const account = session ? await getAccount(db, session.account) : null;
	return account && !activeSuspension(account) ? account : null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
	await sessions(db).deleteOne({ _id: token });
}

/** Sign the account out of every browser (and every game ticket), except the session `keep`. */
export async function deleteSessionsFor(db: Db, accountId: string, keep?: string): Promise<void> {
	await sessions(db).deleteMany(
		keep ? { account: accountId, _id: { $ne: keep } } : { account: accountId }
	);
	await tickets(db).deleteMany({ account: accountId });
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
	await accounts(db).updateOne({ _id: accountId }, { $set: { lastSeen: new Date() } });
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
	if (!account || activeSuspension(account)) return null;
	return { account, explorer: await explorerFor(db, account._id) };
}

/** The account's explorer, created with nothing the first time it is asked for. */
export async function explorerFor(db: Db, accountId: string): Promise<ExplorerDoc> {
	const existing = await explorers(db).findOne({ account: accountId });
	if (existing) return existing.layout === LAYOUT ? existing : upgrade(db, existing);
	const explorer: ExplorerDoc = {
		_id: randomUUID(),
		account: accountId,
		money: 0,
		stash: emptySlots(SLOTS.stash),
		loadout: emptyInventory(),
		layout: LAYOUT,
		underground: null,
		createdAt: new Date()
	};
	await explorers(db).insertOne(explorer);
	return explorer;
}

/**
 * An explorer from before slots (a stash list, and a loadout of quick slots, pack and pockets):
 * everything they own goes into a slot stash, with more slots than usual if it takes them, so
 * nothing is lost. The loadout starts empty.
 */
async function upgrade(db: Db, old: ExplorerDoc): Promise<ExplorerDoc> {
	const before = old as unknown as {
		stash?: (ItemStack | null)[];
		loadout?: {
			hotbar?: (ItemStack | null)[];
			pack?: (ItemStack | null)[];
			pockets?: Record<string, number>;
		};
	};
	const owned = [
		...(before.stash ?? []),
		...(before.loadout?.hotbar ?? []),
		...(Array.isArray(before.loadout?.pack) ? before.loadout.pack : []),
		...Object.entries(before.loadout?.pockets ?? {}).map(([item, count]) => ({ item, count }))
	];
	const stash = emptySlots(SLOTS.stash);
	for (const stack of owned) {
		if (!stack || !(stack.count > 0)) continue;
		let left = addToSlots(stash, stack);
		// Out of room: another row, until it is in (or it turns out not to be something to keep).
		while (left > 0) {
			stash.push(...emptySlots(SLOTS.stashColumns));
			const now = addToSlots(stash, { ...stack, count: left });
			if (now === left) break;
			left = now;
		}
	}
	const explorer: ExplorerDoc = { ...old, stash, loadout: emptyInventory(), layout: LAYOUT };
	await explorers(db).updateOne(
		{ _id: old._id },
		{ $set: { stash, loadout: explorer.loadout, layout: LAYOUT } }
	);
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
	return {
		id: account._id,
		email: account.email,
		gamerTag: account.gamerTag,
		hasPassword: account.password !== undefined,
		discord: account.discord?.username ?? null,
		mfa: account.totp !== undefined,
		recoveryCodesLeft: account.totp?.recovery.length ?? 0,
		explorer: view
	};
}

function hash(password: string, salt: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
	});
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	return `scrypt$${salt.toString('hex')}$${(await hash(password, salt)).toString('hex')}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
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
	const message = String((error as { message?: unknown }).message);
	if (message.includes('tagKey')) return 'tagTaken';
	if (message.includes('discord')) return 'discordTaken';
	return 'emailTaken';
}
