/**
 * Rules for what players send us: bug reports (filed on GitHub), crash prompts, ideas for the
 * board, and private feedback. Shared by the forms and the server that enforces them.
 * See docs/dev/reports.md.
 */
export const REPORT = {
	titleMin: 4,
	titleMax: 120,
	/** What happened, and how to make it happen again. */
	textMax: 4000,
	/** Console warnings and errors kept for a report (the newest). */
	consoleLines: 50,
	/** Longest console line kept. */
	consoleLineMax: 500,
	/** Longest stack kept with a crash. */
	stackMax: 6000,
	/** Labels a filed issue gets on GitHub. */
	labels: ['bug', 'from-game'],
	/** Labels a crash filed from the admin app gets. */
	crashLabels: ['bug', 'crash']
};

/**
 * Errors that are not ours to report, so the crash prompt never asks about them: browser
 * extensions, layout notices, and the network going away (the connection handles that itself).
 * Matched against the start of the message.
 */
export const IGNORED_ERRORS = [
	'ResizeObserver loop',
	'Failed to fetch',
	'NetworkError',
	'Load failed',
	'The operation was aborted',
	'AbortError',
	'Script error'
];

export const IDEA = {
	titleMin: 6,
	titleMax: 100,
	bodyMax: 2000,
	/** Longest note an admin adds for players to read under an idea. */
	noteMax: 500
};

export const FEEDBACK = {
	textMin: 4,
	textMax: 4000
};

/** Where an idea stands. `pending` and `merged` are never on the public board. */
export const IDEA_STATUSES = {
	pending: { label: 'Waiting for review', public: false },
	open: { label: 'Open', public: true },
	planned: { label: 'Planned', public: true },
	inProgress: { label: 'In progress', public: true },
	done: { label: 'Done', public: true },
	declined: { label: 'Declined', public: true },
	merged: { label: 'Merged', public: false }
} satisfies Record<string, { label: string; public: boolean }>;

export type IdeaStatus = keyof typeof IDEA_STATUSES;

/** The statuses an admin can set on an approved idea (merging and approval have their own). */
export const BOARD_STATUSES: IdeaStatus[] = ['open', 'planned', 'inProgress', 'done', 'declined'];

/** Where a report stands. */
export const REPORT_STATUSES = {
	pending: 'Not filed',
	filed: 'Filed',
	failed: 'Filing failed'
} as const;

export type ReportStatus = keyof typeof REPORT_STATUSES;

/** A one-line text field as typed: trimmed, spaces collapsed; null if not a string. */
export function cleanLine(raw: unknown, max: number): string | null {
	if (typeof raw !== 'string') return null;
	const text = raw.trim().replace(/\s+/g, ' ');
	return text.length <= max ? text : null;
}

/** A multi-line text field as typed: trimmed; null if not a string or too long. */
export function cleanText(raw: unknown, max: number): string | null {
	if (typeof raw !== 'string') return null;
	const text = raw.replace(/\r\n/g, '\n').trim();
	return text.length <= max ? text : null;
}
