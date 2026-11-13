import { randomUUID } from 'node:crypto';
import type { Collection, Db, Filter } from 'mongodb';
import { ADMIN } from '../../content/admin.ts';
import {
	FEEDBACK,
	IDEA,
	IDEA_STATUSES,
	cleanLine,
	cleanText,
	type IdeaStatus
} from '../../content/reports.ts';
import type { IdeaView } from '../../shared/reports.ts';

/**
 * The ideas board and private feedback. Players suggest ideas; an admin approves one before it is
 * on the board, where everyone can vote for it (once each). Feedback is only read by admins.
 * Used by the site and the admin app; imports by relative path. See docs/dev/reports.md.
 */

export interface IdeaDoc {
	_id: string;
	author: string;
	/** Their gamer tag when they suggested it (for the admin app; players don't see who). */
	authorTag: string;
	title: string;
	body: string;
	status: IdeaStatus;
	/** A merged idea's votes went to this one. */
	mergedInto?: string;
	/** How many players voted for it: kept in step with `ideaVotes`. */
	votes: number;
	/** What the team says about it, shown under it on the board. */
	note?: string;
	/** The GitHub issue it is being worked on in. */
	issue?: string;
	createdAt: Date;
	updatedAt: Date;
}

interface VoteDoc {
	/** `<idea>:<account>`: one vote per player per idea. */
	_id: string;
	idea: string;
	account: string;
	at: Date;
}

export interface FeedbackDoc {
	_id: string;
	account: string;
	gamerTag: string;
	text: string;
	version: string;
	read: boolean;
	archived: boolean;
	createdAt: Date;
}

const ideas = (db: Db): Collection<IdeaDoc> => db.collection<IdeaDoc>('ideas');
const votes = (db: Db): Collection<VoteDoc> => db.collection<VoteDoc>('ideaVotes');
const feedback = (db: Db): Collection<FeedbackDoc> => db.collection<FeedbackDoc>('feedback');

export async function ensureFeedbackIndexes(db: Db): Promise<void> {
	await ideas(db).createIndex({ status: 1, votes: -1 });
	await ideas(db).createIndex({ author: 1, createdAt: -1 });
	await votes(db).createIndex({ account: 1 });
	await votes(db).createIndex({ idea: 1 });
	await feedback(db).createIndex({ archived: 1, createdAt: -1 });
	await feedback(db).createIndex({ account: 1, createdAt: -1 });
}

/** Ideas that can still be voted for: not done, declined, waiting or merged. */
const VOTABLE: IdeaStatus[] = ['open', 'planned', 'inProgress'];
const PUBLIC = (Object.keys(IDEA_STATUSES) as IdeaStatus[]).filter(
	(status) => IDEA_STATUSES[status].public
);

/** An idea as typed, checked and trimmed; or what is wrong with it, for the player. */
export function cleanIdea(raw: unknown): { title: string; body: string } | { error: string } {
	const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	const title = cleanLine(body.title, IDEA.titleMax);
	if (!title || title.length < IDEA.titleMin) {
		return { error: `Give it a title (${IDEA.titleMin} to ${IDEA.titleMax} characters)` };
	}
	const text = cleanText(body.body ?? '', IDEA.bodyMax);
	if (text === null) return { error: `Keep the description under ${IDEA.bodyMax} characters` };
	return { title, body: text };
}

/** Suggest an idea. It waits for an admin to approve it; its author's vote is already on it. */
export async function createIdea(
	db: Db,
	author: { id: string; gamerTag: string },
	input: { title: string; body: string }
): Promise<IdeaDoc> {
	const now = new Date();
	const idea: IdeaDoc = {
		_id: randomUUID(),
		author: author.id,
		authorTag: author.gamerTag,
		title: input.title,
		body: input.body,
		status: 'pending',
		votes: 1,
		createdAt: now,
		updatedAt: now
	};
	await ideas(db).insertOne(idea);
	await votes(db).insertOne({
		_id: `${idea._id}:${author.id}`,
		idea: idea._id,
		account: author.id,
		at: now
	});
	return idea;
}

function view(idea: IdeaDoc, account: string, voted: Set<string>): IdeaView {
	return {
		id: idea._id,
		title: idea.title,
		body: idea.body,
		status: idea.status,
		votes: idea.votes,
		voted: voted.has(idea._id),
		mine: idea.author === account,
		note: idea.note ?? null,
		createdAt: idea.createdAt.toISOString()
	};
}

/** The board as this player sees it: every approved idea, most votes first, and theirs waiting. */
export async function boardFor(db: Db, account: string): Promise<IdeaView[]> {
	const shown = await ideas(db)
		.find({ $or: [{ status: { $in: PUBLIC } }, { author: account, status: 'pending' }] })
		.sort({ votes: -1, createdAt: 1 })
		.limit(500)
		.toArray();
	const mine = await votes(db)
		.find({ account, idea: { $in: shown.map((idea) => idea._id) } })
		.toArray();
	const voted = new Set(mine.map((vote) => vote.idea));
	return shown.map((idea) => view(idea, account, voted));
}

/**
 * Vote for an idea, or take the vote back. Only ideas on the board that are still open to it.
 * Returns its votes after, or null if it can't be voted on.
 */
export async function setVote(
	db: Db,
	ideaId: string,
	account: string,
	on: boolean
): Promise<number | null> {
	const idea = await ideas(db).findOne({ _id: ideaId, status: { $in: VOTABLE } });
	if (!idea) return null;
	const id = `${ideaId}:${account}`;
	let change = 0;
	if (on) {
		const result = await votes(db).updateOne(
			{ _id: id },
			{ $setOnInsert: { idea: ideaId, account, at: new Date() } },
			{ upsert: true }
		);
		if (result.upsertedCount === 1) change = 1;
	} else {
		const result = await votes(db).deleteOne({ _id: id });
		if (result.deletedCount === 1) change = -1;
	}
	if (change === 0) return idea.votes;
	const after = await ideas(db).findOneAndUpdate(
		{ _id: ideaId },
		{ $inc: { votes: change } },
		{ returnDocument: 'after' }
	);
	return after?.votes ?? idea.votes + change;
}

// --- Admin --------------------------------------------------------------------------------------

export async function getIdea(db: Db, id: string): Promise<IdeaDoc | null> {
	return ideas(db).findOne({ _id: id });
}

/** Ideas for the admin app: by status (or all but merged), most votes first. */
export async function listIdeas(
	db: Db,
	options: { status?: IdeaStatus; author?: string; limit?: number } = {}
): Promise<IdeaDoc[]> {
	const filter: Filter<IdeaDoc> = {};
	if (options.status) filter.status = options.status;
	else filter.status = { $ne: 'merged' };
	if (options.author) filter.author = options.author;
	return ideas(db)
		.find(filter)
		.sort(options.status === 'pending' ? { createdAt: 1 } : { votes: -1, createdAt: 1 })
		.limit(options.limit ?? 200)
		.toArray();
}

/**
 * Change an idea: its title and description (tidied for the board), status, the note players
 * see, the GitHub issue. Approving is setting `open` on a `pending` one.
 */
export async function updateIdea(
	db: Db,
	id: string,
	change: Partial<Pick<IdeaDoc, 'title' | 'body' | 'status' | 'note' | 'issue'>>
): Promise<void> {
	const set: Partial<IdeaDoc> = { updatedAt: new Date() };
	const unset: Record<string, ''> = {};
	for (const [key, value] of Object.entries(change) as [keyof typeof change, string][]) {
		if (value === undefined) continue;
		if (value === '' && (key === 'note' || key === 'issue')) unset[key] = '';
		else (set as Record<string, unknown>)[key] = value;
	}
	await ideas(db).updateOne(
		{ _id: id },
		Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set }
	);
}

/**
 * Merge a duplicate into another idea: its voters vote for the other (once each, however many of
 * the two they voted for), and it leaves the board.
 */
export async function mergeIdea(db: Db, from: string, into: string): Promise<boolean> {
	if (from === into) return false;
	const target = await ideas(db).findOne({ _id: into, status: { $nin: ['merged', 'pending'] } });
	if (!target) return false;
	const moving = await votes(db).find({ idea: from }).toArray();
	for (const vote of moving) {
		await votes(db).updateOne(
			{ _id: `${into}:${vote.account}` },
			{ $setOnInsert: { idea: into, account: vote.account, at: vote.at } },
			{ upsert: true }
		);
	}
	await votes(db).deleteMany({ idea: from });
	const count = await votes(db).countDocuments({ idea: into });
	await ideas(db).updateOne({ _id: into }, { $set: { votes: count, updatedAt: new Date() } });
	await ideas(db).updateOne(
		{ _id: from },
		{ $set: { status: 'merged', mergedInto: into, votes: 0, updatedAt: new Date() } }
	);
	return true;
}

// --- Feedback -----------------------------------------------------------------------------------

export function cleanFeedback(raw: unknown): string | { error: string } {
	const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	const text = cleanText(body.text, FEEDBACK.textMax);
	if (text === null) return { error: `Keep it under ${FEEDBACK.textMax} characters` };
	if (text.length < FEEDBACK.textMin) return { error: 'Write a little more' };
	return text;
}

export async function createFeedback(
	db: Db,
	account: { id: string; gamerTag: string },
	text: string,
	version: string
): Promise<void> {
	await feedback(db).insertOne({
		_id: randomUUID(),
		account: account.id,
		gamerTag: account.gamerTag,
		text,
		version,
		read: false,
		archived: false,
		createdAt: new Date()
	});
}

/** The feedback inbox (or the archive), newest first; or one player's. */
export async function listFeedback(
	db: Db,
	options: { archived?: boolean; account?: string; limit?: number } = {}
): Promise<FeedbackDoc[]> {
	const filter: Filter<FeedbackDoc> = options.account
		? { account: options.account }
		: { archived: options.archived ?? false };
	return feedback(db)
		.find(filter)
		.sort({ createdAt: -1 })
		.limit(options.limit ?? ADMIN.pageSize)
		.toArray();
}

export async function markFeedback(
	db: Db,
	id: string,
	change: { read?: boolean; archived?: boolean }
): Promise<boolean> {
	const result = await feedback(db).updateOne({ _id: id }, { $set: change });
	return result.matchedCount === 1;
}

/** How much feedback hasn't been read yet (for the admin dashboard). */
export async function unreadFeedback(db: Db): Promise<number> {
	return feedback(db).countDocuments({ read: false, archived: false });
}
