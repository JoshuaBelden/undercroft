import { createHash, randomUUID } from 'node:crypto';
import type { Collection, Db, Filter } from 'mongodb';
import { ADMIN } from '../../content/admin.ts';
import { REPORT, cleanLine, cleanText, type ReportStatus } from '../../content/reports.ts';
import type { CrashInfo, Diagnostics, ReportInput } from '../../shared/reports.ts';

/**
 * Bug reports from players, and the errors (crashes) the servers saw. A report is kept here and
 * filed on GitHub (src/lib/server/github.ts); errors are grouped by a fingerprint so the same
 * crash is one line with a count. Used by the site, the game server and the admin app; imports by
 * relative path. See docs/dev/reports.md.
 */

export interface IssueRef {
	number: number;
	url: string;
}

export interface ReportDoc {
	_id: string;
	account: string;
	/** Their gamer tag when they sent it (for the admin app; never filed on GitHub). */
	gamerTag: string;
	title: string;
	description: string;
	steps: string;
	diagnostics?: Diagnostics;
	crash?: CrashInfo;
	/** The `errors` entry the crash belongs to. */
	errorId?: string;
	status: ReportStatus;
	issue?: IssueRef;
	/** Why filing failed, for the admin app. */
	failure?: string;
	createdAt: Date;
}

export interface ErrorDoc {
	_id: string;
	/** Same crash, same fingerprint: see `fingerprint`. Unique. */
	fingerprint: string;
	source: CrashInfo['source'];
	message: string;
	stack?: string;
	count: number;
	/** How many reports players sent about it. */
	reports: number;
	versions: string[];
	firstSeen: Date;
	lastSeen: Date;
	issue?: IssueRef;
}

const reports = (db: Db): Collection<ReportDoc> => db.collection<ReportDoc>('reports');
const errors = (db: Db): Collection<ErrorDoc> => db.collection<ErrorDoc>('errors');

export async function ensureReportIndexes(db: Db): Promise<void> {
	await reports(db).createIndex({ createdAt: -1 });
	await reports(db).createIndex({ account: 1, createdAt: -1 });
	await reports(db).createIndex({ status: 1, createdAt: -1 });
	await errors(db).createIndex({ fingerprint: 1 }, { unique: true });
	await errors(db).createIndex({ lastSeen: -1 });
}

/**
 * What makes two errors the same crash: where it came from, the message with its numbers and ids
 * taken out, and the top line of the stack without line numbers or build hashes. So one bug seen
 * a thousand times (with different values in its message) is one entry.
 */
export function fingerprint(source: string, message: string, stack?: string): string {
	const text = message.replace(/[0-9a-f]{8,}/gi, '#').replace(/\d+/g, '#');
	const frame =
		stack
			?.split('\n')
			.map((line) => line.trim())
			.find((line) => line.startsWith('at ') || line.includes('@'))
			?.replace(/:\d+(:\d+)?\)?$/, '')
			.replace(/[-.][A-Za-z0-9_-]{8}\.js/g, '.js')
			.replace(/\?[^\s)]*/g, '') ?? '';
	return createHash('sha256').update(`${source}\n${text}\n${frame}`).digest('hex').slice(0, 32);
}

/** Note an error a server (or a player's report) saw. Returns its id in `errors`. */
export async function recordError(
	db: Db,
	error: { source: CrashInfo['source']; message: string; stack?: string; version: string }
): Promise<string> {
	const message = error.message.slice(0, 1000) || 'Unknown error';
	const stack = error.stack?.slice(0, REPORT.stackMax);
	const now = new Date();
	const doc = await errors(db).findOneAndUpdate(
		{ fingerprint: fingerprint(error.source, message, stack) },
		{
			$inc: { count: 1 },
			$set: { lastSeen: now, message, ...(stack ? { stack } : {}) },
			$addToSet: { versions: error.version },
			$setOnInsert: { _id: randomUUID(), source: error.source, reports: 0, firstSeen: now }
		},
		{ upsert: true, returnDocument: 'after' }
	);
	return doc?._id ?? '';
}

/** A report as sent, checked and trimmed; or what is wrong with it, for the player. */
export function cleanReport(raw: unknown): ReportInput | { error: string } {
	const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	const title = cleanLine(body.title, REPORT.titleMax);
	if (!title || title.length < REPORT.titleMin) {
		return { error: `Give it a title (${REPORT.titleMin} to ${REPORT.titleMax} characters)` };
	}
	const description = cleanText(body.description ?? '', REPORT.textMax);
	const steps = cleanText(body.steps ?? '', REPORT.textMax);
	if (description === null || steps === null) {
		return { error: `Keep each box under ${REPORT.textMax} characters` };
	}
	if (!description) return { error: 'Say what happened' };
	const input: ReportInput = { title, description, steps };
	const diagnostics = cleanDiagnostics(body.diagnostics);
	if (diagnostics) input.diagnostics = diagnostics;
	const crash = cleanCrash(body.crash);
	if (crash) input.crash = crash;
	return input;
}

function cleanDiagnostics(raw: unknown): Diagnostics | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const d = raw as Record<string, unknown>;
	const text = (value: unknown, max = 300): string | undefined =>
		typeof value === 'string' && value ? value.slice(0, max) : undefined;
	const out: Diagnostics = {
		version: text(d.version, 40) ?? 'unknown',
		userAgent: text(d.userAgent) ?? 'unknown'
	};
	const gpu = text(d.gpu);
	if (gpu) out.gpu = gpu;
	const screen = text(d.screen, 40);
	if (screen) out.screen = screen;
	const page = text(d.page, 200);
	if (page) out.page = page;
	if (d.mode === 'solo' || d.mode === 'coop') out.mode = d.mode;
	if (typeof d.seed === 'number' && Number.isFinite(d.seed)) out.seed = d.seed;
	const room = text(d.room, 80);
	if (room) out.room = room;
	if (typeof d.stats === 'object' && d.stats !== null) {
		const stats: Record<string, number> = {};
		for (const [key, value] of Object.entries(d.stats).slice(0, 20)) {
			if (typeof value === 'number' && Number.isFinite(value)) stats[key.slice(0, 30)] = value;
		}
		out.stats = stats;
	}
	if (Array.isArray(d.console)) {
		out.console = d.console
			.filter((line): line is string => typeof line === 'string')
			.slice(-REPORT.consoleLines)
			.map((line) => line.slice(0, REPORT.consoleLineMax));
	}
	return out;
}

function cleanCrash(raw: unknown): CrashInfo | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const c = raw as Record<string, unknown>;
	if (c.source !== 'client' && c.source !== 'web' && c.source !== 'game') return null;
	if (typeof c.message !== 'string' || !c.message) return null;
	const crash: CrashInfo = { source: c.source, message: c.message.slice(0, 1000) };
	if (typeof c.stack === 'string' && c.stack) crash.stack = c.stack.slice(0, REPORT.stackMax);
	if (typeof c.errorId === 'string' && /^[0-9a-f-]{36}$/.test(c.errorId)) {
		crash.errorId = c.errorId;
	}
	return crash;
}

/**
 * Keep a report. A crash in it is grouped with the others like it: a server error keeps the id it
 * was recorded under; one from the browser is recorded now.
 */
export async function createReport(
	db: Db,
	account: { id: string; gamerTag: string },
	input: ReportInput,
	version: string
): Promise<ReportDoc> {
	const report: ReportDoc = {
		_id: randomUUID(),
		account: account.id,
		gamerTag: account.gamerTag,
		title: input.title,
		description: input.description,
		steps: input.steps,
		status: 'pending',
		createdAt: new Date()
	};
	if (input.diagnostics) report.diagnostics = input.diagnostics;
	if (input.crash) {
		report.crash = input.crash;
		const known = input.crash.errorId
			? await errors(db).findOne({ _id: input.crash.errorId })
			: null;
		report.errorId = known
			? known._id
			: await recordError(db, { ...input.crash, version: input.diagnostics?.version ?? version });
		await errors(db).updateOne({ _id: report.errorId }, { $inc: { reports: 1 } });
	}
	await reports(db).insertOne(report);
	return report;
}

export async function getReport(db: Db, id: string): Promise<ReportDoc | null> {
	return reports(db).findOne({ _id: id });
}

export async function getError(db: Db, id: string): Promise<ErrorDoc | null> {
	return errors(db).findOne({ _id: id });
}

export async function markReportFiled(db: Db, id: string, issue: IssueRef): Promise<void> {
	await reports(db).updateOne(
		{ _id: id },
		{ $set: { status: 'filed', issue }, $unset: { failure: '' } }
	);
}

export async function markReportFailed(db: Db, id: string, failure: string): Promise<void> {
	await reports(db).updateOne(
		{ _id: id },
		{ $set: { status: 'failed', failure: failure.slice(0, 500) } }
	);
}

export async function setErrorIssue(db: Db, id: string, issue: IssueRef): Promise<void> {
	await errors(db).updateOne({ _id: id }, { $set: { issue } });
}

/** Reports, newest first: all, by status, by player, or about one crash. */
export async function listReports(
	db: Db,
	options: { status?: ReportStatus; account?: string; errorId?: string; limit?: number } = {}
): Promise<ReportDoc[]> {
	const filter: Filter<ReportDoc> = {};
	if (options.status) filter.status = options.status;
	if (options.account) filter.account = options.account;
	if (options.errorId) filter.errorId = options.errorId;
	return reports(db)
		.find(filter)
		.sort({ createdAt: -1 })
		.limit(options.limit ?? ADMIN.pageSize)
		.toArray();
}

/** Crashes, the most recently seen first. */
export async function listErrors(
	db: Db,
	options: { source?: CrashInfo['source']; limit?: number } = {}
): Promise<ErrorDoc[]> {
	return errors(db)
		.find(options.source ? { source: options.source } : {})
		.sort({ lastSeen: -1 })
		.limit(options.limit ?? ADMIN.pageSize)
		.toArray();
}
