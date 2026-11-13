/**
 * The release notes, read from CHANGELOG.md at build time so there is one copy. Only the small
 * part of Markdown the file uses is understood: `## <version> - <date>` (or `## Unreleased`),
 * `### <heading>`, `- ` bullets, paragraphs, and **bold**, `code` and [links](url) inside them.
 * Rendered by src/routes/about/changes/+page.svelte. See docs/dev/releasing.md.
 */
import source from '../../../CHANGELOG.md?raw';

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
	/** Null for the Unreleased section: what is on the server but not yet numbered. */
	version: string | null;
	date: string | null;
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

export function parseChangelog(markdown: string): Release[] {
	const releases: Release[] = [];
	let current: Release | null = null;
	for (const raw of markdown.split(/\r?\n/)) {
		const line = raw.trim();
		const release = /^## (.+)$/.exec(line);
		if (release) {
			const [version, date] = release[1].split(/\s+-\s+/);
			current = {
				version: /^unreleased$/i.test(version) ? null : version,
				date: date ?? null,
				blocks: []
			};
			releases.push(current);
			continue;
		}
		// Anything before the first release is the file's own introduction.
		if (!current || !line) continue;
		const heading = /^### (.+)$/.exec(line);
		if (heading) current.blocks.push({ kind: 'heading', text: heading[1] });
		else if (line.startsWith('- ')) {
			const previous = current.blocks.at(-1);
			if (previous?.kind === 'list') previous.items.push(inline(line.slice(2)));
			else current.blocks.push({ kind: 'list', items: [inline(line.slice(2))] });
		} else current.blocks.push({ kind: 'paragraph', parts: inline(line) });
	}
	// An empty Unreleased section (right after a release) isn't worth a heading.
	return releases.filter((r) => r.version !== null || r.blocks.length > 0);
}

export const RELEASES: Release[] = parseChangelog(source);
