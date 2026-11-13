import { randomBytes, randomUUID } from 'node:crypto';
import type { Collection, Db, Filter } from 'mongodb';
import { ADMIN, type AuditAction } from '../../content/admin.ts';
import { activeSuspension, getAccount, type AccountDoc } from './accounts.ts';

/**
 * Staff: who is an admin, the admin app's own sessions, and the audit log of what admins did.
 * Used by the admin app (admin/) and `pnpm admin:grant`; imports by relative path like the rest of
 * the store. See docs/dev/admin.md.
 */

interface AdminSessionDoc {
	_id: string;
	account: string;
	expires: Date;
}

export interface AuditDoc {
	_id: string;
	/** The admin's account id, or `script` for `pnpm admin:grant`. */
	admin: string;
	/** The admin's gamer tag when it happened, so the log reads without a lookup. */
	adminTag: string;
	action: AuditAction;
	/** What it was done to: an account id, a report id, an idea id... */
	target?: string;
	/** A few words: the reason for a suspension, the new tag, the issue number. */
	detail?: string;
	at: Date;
}

const accounts = (db: Db): Collection<AccountDoc> => db.collection<AccountDoc>('accounts');
const adminSessions = (db: Db): Collection<AdminSessionDoc> =>
	db.collection<AdminSessionDoc>('adminSessions');
const auditLog = (db: Db): Collection<AuditDoc> => db.collection<AuditDoc>('adminLog');

export async function ensureAdminIndexes(db: Db): Promise<void> {
	await adminSessions(db).createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
	await adminSessions(db).createIndex({ account: 1 });
	await auditLog(db).createIndex({ at: -1 });
	await auditLog(db).createIndex({ target: 1, at: -1 });
}

/** Whether this account may use the admin app now. A suspended admin may not. */
export function isAdmin(account: AccountDoc | null): account is AccountDoc {
	return account?.role === 'admin' && !activeSuspension(account);
}

/** Sign in to the admin app; returns the cookie value. */
export async function createAdminSession(db: Db, accountId: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	await adminSessions(db).insertOne({
		_id: token,
		account: accountId,
		expires: new Date(Date.now() + ADMIN.sessionHours * 3600_000)
	});
	return token;
}

/** The admin an admin-app session belongs to; null if it ended or they are no longer an admin. */
export async function adminSessionAccount(db: Db, token: string): Promise<AccountDoc | null> {
	if (!/^[0-9a-f]{64}$/.test(token)) return null;
	const session = await adminSessions(db).findOne({ _id: token, expires: { $gt: new Date() } });
	const account = session ? await getAccount(db, session.account) : null;
	return isAdmin(account) ? account : null;
}

export async function deleteAdminSession(db: Db, token: string): Promise<void> {
	await adminSessions(db).deleteOne({ _id: token });
}

/** Make the account an admin, or not (which also ends its admin-app sessions). */
export async function setRole(db: Db, accountId: string, admin: boolean): Promise<void> {
	if (admin) {
		await accounts(db).updateOne({ _id: accountId }, { $set: { role: 'admin' } });
	} else {
		await accounts(db).updateOne({ _id: accountId }, { $unset: { role: '' } });
		await adminSessions(db).deleteMany({ account: accountId });
	}
}

/** Write one line of the audit log. Every change made from the admin app goes through here. */
export async function audit(
	db: Db,
	admin: { id: string; gamerTag: string },
	action: AuditAction,
	target?: string,
	detail?: string
): Promise<void> {
	const entry: AuditDoc = {
		_id: randomUUID(),
		admin: admin.id,
		adminTag: admin.gamerTag,
		action,
		at: new Date()
	};
	if (target) entry.target = target;
	if (detail) entry.detail = detail;
	await auditLog(db).insertOne(entry);
}

/** The audit log, newest first: everything, or what was done to one target. */
export async function readAudit(
	db: Db,
	options: { target?: string; limit?: number } = {}
): Promise<AuditDoc[]> {
	const filter: Filter<AuditDoc> = options.target ? { target: options.target } : {};
	return auditLog(db)
		.find(filter)
		.sort({ at: -1 })
		.limit(options.limit ?? ADMIN.pageSize)
		.toArray();
}
