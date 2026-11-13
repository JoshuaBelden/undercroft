import { createHash, randomBytes } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import { ACCOUNT, THROTTLE, type ThrottleRule } from '../../content/account.ts';
import { generateSecret, verifyCode } from '../totp.ts';
import {
	createAccount,
	deleteSessionsFor,
	getAccount,
	setAccountPassword,
	type AccountDoc,
	type AccountError
} from './accounts.ts';

/**
 * Everything around signing in besides the password itself: password-reset links, two-step
 * sign-in (authenticator codes and recovery codes), Discord sign-up and linking, and limits on how
 * often things can be tried. Imports by relative path, like the rest of the store.
 * See docs/dev/accounts.md.
 */

interface ExpiringDoc {
	_id: string;
	account: string;
	expires: Date;
}

interface ChallengeDoc extends ExpiringDoc {
	attempts: number;
}

/** A Discord sign-up waiting for its gamer tag. */
export interface SignupDoc {
	_id: string;
	discord: { id: string; username: string };
	email: string;
	expires: Date;
}

interface ThrottleDoc {
	_id: string;
	count: number;
	expires: Date;
}

const accounts = (db: Db): Collection<AccountDoc> => db.collection<AccountDoc>('accounts');
const resets = (db: Db): Collection<ExpiringDoc> => db.collection<ExpiringDoc>('resets');
const challenges = (db: Db): Collection<ChallengeDoc> => db.collection<ChallengeDoc>('challenges');
const signups = (db: Db): Collection<SignupDoc> => db.collection<SignupDoc>('signups');
const throttles = (db: Db): Collection<ThrottleDoc> => db.collection<ThrottleDoc>('throttle');

export async function ensureAuthIndexes(db: Db): Promise<void> {
	for (const collection of [resets(db), challenges(db), signups(db), throttles(db)]) {
		await collection.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
	}
}

const token = (): string => randomBytes(32).toString('hex');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const minutesFromNow = (minutes: number): Date => new Date(Date.now() + minutes * 60_000);
const isToken = (value: unknown): value is string =>
	typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

/**
 * Count one try of `rule` for `key`. False once there have been too many in the rule's window:
 * refuse it. The window starts at the first try and doesn't move.
 */
export async function throttle(db: Db, rule: ThrottleRule, key: string): Promise<boolean> {
	const { count, minutes } = THROTTLE[rule];
	const id = `${rule}:${key}`;
	// MongoDB removes expired documents about once a minute; one that is due can go now.
	await throttles(db).deleteOne({ _id: id, expires: { $lte: new Date() } });
	const doc = await throttles(db).findOneAndUpdate(
		{ _id: id },
		{ $inc: { count: 1 }, $setOnInsert: { expires: minutesFromNow(minutes) } },
		{ upsert: true, returnDocument: 'after' }
	);
	return (doc?.count ?? 1) <= count;
}

/**
 * Whether `rule` has run out for `key`, without counting a try. For limits on failures: check
 * this first, and `throttle` only when the try fails, so getting it right never uses one up.
 */
export async function throttled(db: Db, rule: ThrottleRule, key: string): Promise<boolean> {
	const doc = await throttles(db).findOne({ _id: `${rule}:${key}`, expires: { $gt: new Date() } });
	return (doc?.count ?? 0) >= THROTTLE[rule].count;
}

/** Check a second factor under the `code` limit: only wrong codes count against it. */
export async function checkSecondFactor(
	db: Db,
	account: AccountDoc,
	code: unknown
): Promise<'ok' | 'code' | 'throttled'> {
	if (await throttled(db, 'code', account._id)) return 'throttled';
	if (await useSecondFactor(db, account, code)) return 'ok';
	await throttle(db, 'code', account._id);
	return 'code';
}

// --- Password reset -------------------------------------------------------------------------

/**
 * A reset link's token for the account with this email, or null if there is no such account.
 * Only the token's hash is kept, so the database alone can't be used to reset anyone.
 */
export async function requestReset(
	db: Db,
	email: string
): Promise<{ account: AccountDoc; token: string } | null> {
	const account = await accounts(db).findOne({ email });
	if (!account) return null;
	const secret = token();
	await resets(db).insertOne({
		_id: sha256(secret),
		account: account._id,
		expires: minutesFromNow(ACCOUNT.resetMinutes)
	});
	return { account, token: secret };
}

/** Whether a reset link still works (for the page that asks for the new password). */
export async function resetIsValid(db: Db, secret: unknown): Promise<boolean> {
	if (!isToken(secret)) return false;
	return (
		(await resets(db).countDocuments({ _id: sha256(secret), expires: { $gt: new Date() } })) > 0
	);
}

/**
 * Use a reset link: set the new password and sign the account out everywhere. Each link works
 * once, and every other link for the account stops working too.
 */
export async function consumeReset(
	db: Db,
	secret: unknown,
	password: unknown
): Promise<AccountError | 'expired' | null> {
	if (!isToken(secret)) return 'expired';
	const reset = await resets(db).findOne({ _id: sha256(secret), expires: { $gt: new Date() } });
	if (!reset) return 'expired';
	const failed = await setAccountPassword(db, reset.account, password);
	if (failed) return failed;
	await resets(db).deleteMany({ account: reset.account });
	await deleteSessionsFor(db, reset.account);
	return null;
}

// --- Two-step sign-in -----------------------------------------------------------------------

/** The password (or Discord) was right and the account has two-step on: wait for the code. */
export async function startChallenge(db: Db, accountId: string): Promise<string> {
	const id = token();
	await challenges(db).insertOne({
		_id: id,
		account: accountId,
		expires: minutesFromNow(ACCOUNT.challengeMinutes),
		attempts: 0
	});
	return id;
}

export type ChallengeError = 'expired' | 'code' | 'throttled';

/** Finish signing in with the code from the app (or a recovery code). */
export async function finishChallenge(
	db: Db,
	challenge: unknown,
	code: unknown
): Promise<{ account: AccountDoc } | { error: ChallengeError }> {
	if (!isToken(challenge)) return { error: 'expired' };
	const doc = await challenges(db).findOneAndUpdate(
		{ _id: challenge, expires: { $gt: new Date() } },
		{ $inc: { attempts: 1 } },
		{ returnDocument: 'after' }
	);
	if (!doc) return { error: 'expired' };
	const account = await getAccount(db, doc.account);
	if (!account) return { error: 'expired' };
	const checked =
		doc.attempts > THROTTLE.code.count ? 'throttled' : await checkSecondFactor(db, account, code);
	if (checked === 'throttled') {
		await challenges(db).deleteOne({ _id: challenge });
		return { error: 'throttled' };
	}
	if (checked === 'code') return { error: 'code' };
	await challenges(db).deleteOne({ _id: challenge });
	return { account };
}

/**
 * Check a code from the authenticator app, or a recovery code, for an account with two-step on.
 * A code that works is used up: the app's until the next one, a recovery code for good.
 */
export async function useSecondFactor(
	db: Db,
	account: AccountDoc,
	code: unknown
): Promise<boolean> {
	const totp = account.totp;
	if (!totp || typeof code !== 'string') return false;
	const step = verifyCode(totp.secret, code, totp.usedStep);
	if (step !== null) {
		// Only if no other request used this step (or a later one) first.
		const result = await accounts(db).updateOne(
			{ _id: account._id, 'totp.usedStep': { $lt: step } },
			{ $set: { 'totp.usedStep': step } }
		);
		return result.modifiedCount === 1;
	}
	const hashed = sha256(cleanRecovery(code));
	const result = await accounts(db).updateOne(
		{ _id: account._id, 'totp.recovery': hashed },
		{ $pull: { 'totp.recovery': hashed } }
	);
	return result.modifiedCount === 1;
}

/** Start setting up two-step: a new secret, kept aside until a code from it is entered. */
export async function beginTotpSetup(db: Db, accountId: string): Promise<string> {
	const secret = generateSecret();
	await accounts(db).updateOne({ _id: accountId }, { $set: { totpPending: secret } });
	return secret;
}

/**
 * Turn two-step on, if `code` comes from the secret being set up. Returns the recovery codes
 * (shown once, never again), or null if the code is wrong.
 */
export async function enableTotp(
	db: Db,
	accountId: string,
	code: unknown
): Promise<string[] | null> {
	const account = await getAccount(db, accountId);
	if (!account?.totpPending || typeof code !== 'string') return null;
	const step = verifyCode(account.totpPending, code);
	if (step === null) return null;
	const codes = Array.from({ length: ACCOUNT.recoveryCodeCount }, recoveryCode);
	await accounts(db).updateOne(
		{ _id: accountId },
		{
			$set: {
				totp: {
					secret: account.totpPending,
					enabledAt: new Date(),
					recovery: codes.map((each) => sha256(cleanRecovery(each))),
					usedStep: step
				}
			},
			$unset: { totpPending: '' }
		}
	);
	return codes;
}

export async function disableTotp(db: Db, accountId: string): Promise<void> {
	await accounts(db).updateOne({ _id: accountId }, { $unset: { totp: '', totpPending: '' } });
}

/** A recovery code as players see it: `xxxxx-xxxxx`, lower-case letters and digits. */
function recoveryCode(): string {
	const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
	const bytes = randomBytes(10);
	const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
	return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/** A recovery code as typed, in the form it is hashed in. */
function cleanRecovery(code: string): string {
	return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// --- Discord ----------------------------------------------------------------------------------

export async function accountByDiscord(db: Db, discordId: string): Promise<AccountDoc | null> {
	return accounts(db).findOne({ 'discord.id': discordId });
}

export async function accountByEmail(db: Db, email: string): Promise<AccountDoc | null> {
	return accounts(db).findOne({ email });
}

/** Link a Discord account to this one. Refused if another account already has it. */
export async function linkDiscord(
	db: Db,
	accountId: string,
	discord: { id: string; username: string }
): Promise<AccountError | null> {
	const other = await accountByDiscord(db, discord.id);
	if (other && other._id !== accountId) return 'discordTaken';
	await accounts(db).updateOne({ _id: accountId }, { $set: { discord } });
	return null;
}

/** Unlink Discord. Refused for an account with no password: it would have no way in. */
export async function unlinkDiscord(db: Db, accountId: string): Promise<'noPassword' | null> {
	const result = await accounts(db).updateOne(
		{ _id: accountId, password: { $exists: true } },
		{ $unset: { discord: '' } }
	);
	return result.matchedCount === 1 ? null : 'noPassword';
}

/** Someone new signed in with Discord: keep who they are while they choose a gamer tag. */
export async function startSignup(
	db: Db,
	discord: { id: string; username: string },
	email: string
): Promise<string> {
	const id = token();
	await signups(db).insertOne({
		_id: id,
		discord,
		email,
		expires: minutesFromNow(ACCOUNT.signupMinutes)
	});
	return id;
}

export async function getSignup(db: Db, id: unknown): Promise<SignupDoc | null> {
	if (!isToken(id)) return null;
	return signups(db).findOne({ _id: id, expires: { $gt: new Date() } });
}

/** Finish a Discord sign-up with the gamer tag they chose. */
export async function finishSignup(
	db: Db,
	id: unknown,
	gamerTag: unknown
): Promise<{ account: AccountDoc } | { error: AccountError | 'expired' }> {
	const signup = await getSignup(db, id);
	if (!signup) return { error: 'expired' };
	const result = await createAccount(db, {
		email: signup.email,
		gamerTag,
		discord: signup.discord
	});
	if ('account' in result) await signups(db).deleteOne({ _id: signup._id });
	return result;
}
