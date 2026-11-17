import { describe, expect, it } from 'vitest';
import { RELEASE, notReady, notesFromCommits, parseNotes } from './release.ts';

describe('release notes', () => {
	it('parses headings, bullets, paragraphs and inline marks', () => {
		const blocks = parseNotes(
			'### New\n\n- **Rope** packs\n- See `M` and [help](https://x.test)\n\nThanks for testing.'
		);
		expect(blocks).toEqual([
			{ kind: 'heading', text: 'New' },
			{
				kind: 'list',
				items: [
					[{ text: 'Rope', bold: true }, { text: ' packs' }],
					[
						{ text: 'See ' },
						{ text: 'M', code: true },
						{ text: ' and ' },
						{ text: 'help', url: 'https://x.test' }
					]
				]
			},
			{ kind: 'paragraph', parts: [{ text: 'Thanks for testing.' }] }
		]);
	});

	it('builds the notes from commit subjects, oldest first, leaving out release commits', () => {
		const notes = notesFromCommits(['Medkits', '', 'Release v0.2.0', ' Rope: climbing ']);
		expect(notes).toBe('- Rope: climbing\n- Medkits');
		expect(notesFromCommits([])).toBe('');
	});

	it('is ready to release only the version its notes were written for', () => {
		const entry = { version: '0.3.0', date: '2026-11-17', notes: '- Ropes you climb' };
		expect(notReady(entry, '0.3.0')).toBeNull();
		expect(notReady(entry, '0.4.0')).toContain('/release-notes 0.4.0');
		expect(notReady({ ...entry, notes: '  \n' }, '0.3.0')).toContain('no notes');
	});

	it('the release shipped has a version, a date and notes', () => {
		expect(RELEASE.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(RELEASE.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(RELEASE.blocks.length).toBeGreaterThan(0);
	});
});
