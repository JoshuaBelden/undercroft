/**
 * The current release's notes, for the in-game What's new page
 * (src/routes/about/changes/+page.svelte). They are written into `release.json` for players
 * before each release (the release-notes skill), and `pnpm release` puts the same notes in the
 * release's tag and GitHub release, where every earlier release's notes stay. See
 * docs/dev/releasing.md.
 *
 * The notes are a small part of Markdown: `### <heading>`, `- ` bullets, paragraphs, and
 * **bold**, `code` and [links](url) inside them.
 */
import release from './release.json';

/** The current release as `release.json` keeps it. */
export interface ReleaseEntry {
	version: string;
	/** YYYY-MM-DD. */
	date: string;
	/** The notes, in Markdown. */
	notes: string;
}

export interface Inline {
	text: string;
	bold?: boolean;
	code?: boolean;
	url?: string;
}

export type Block =
	| { kind: 'heading'; text: string }
	| { kind: 'paragraph'; parts: Inline[] }
	| { kind: 'list'; items: Inline[][] };

export interface Release {
	version: string;
	date: string;
	blocks: Block[];
}

const INLINE = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;

export function inline(text: string): Inline[] {
	const parts: Inline[] = [];
	let last = 0;
	for (const match of text.matchAll(INLINE)) {
		if (match.index > last) parts.push({ text: text.slice(last, match.index) });
		if (match[1]) parts.push({ text: match[1], bold: true });
		else if (match[2]) parts.push({ text: match[2], code: true });
		else parts.push({ text: match[3], url: match[4] });
		last = match.index + match[0].length;
	}
	if (last < text.length) parts.push({ text: text.slice(last) });
	return parts;
}

/** A release's notes as blocks to show. */
export function parseNotes(markdown: string): Block[] {
	const blocks: Block[] = [];
	for (const raw of markdown.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const heading = /^### (.+)$/.exec(line);
		if (heading) blocks.push({ kind: 'heading', text: heading[1] });
		else if (line.startsWith('- ')) {
			const previous = blocks.at(-1);
			if (previous?.kind === 'list') previous.items.push(inline(line.slice(2)));
			else blocks.push({ kind: 'list', items: [inline(line.slice(2))] });
		} else blocks.push({ kind: 'paragraph', parts: inline(line) });
	}
	return blocks;
}

/**
 * Why `release.json` isn't ready to release `version`, or null when it is. The notes are written
 * for the release before `pnpm release` runs (the release-notes skill, .claude/skills/), so
 * they must be for this version, and say something.
 */
export function notReady(entry: ReleaseEntry, version: string): string | null {
	if (entry.version !== version) {
		return `release.json has the notes for ${entry.version}, not ${version}: write the notes for ${version} first (/release-notes ${version}).`;
	}
	if (parseNotes(entry.notes).length === 0) return `release.json has no notes for ${version}.`;
	return null;
}

/**
 * The commits of a release as a raw list, from their subjects (newest first, as `git log` gives
 * them): a bullet each, oldest first. Release commits and blank lines are left out. Not for
 * players: it is what the notes are written from.
 */
export function notesFromCommits(subjects: string[]): string {
	return subjects
		.map((s) => s.trim())
		.filter((s) => s && !/^Release v\d/.test(s))
		.reverse()
		.map((s) => `- ${s}`)
		.join('\n');
}

export const RELEASE: Release = {
	version: release.version,
	date: release.date,
	blocks: parseNotes(release.notes)
};
