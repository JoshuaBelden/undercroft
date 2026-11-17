import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESENCE, presenceFor } from './presence.ts';

describe('rich presence', () => {
	it('says where the player is and with how many', () => {
		expect(presenceFor(false, 1)).toBe('hub');
		expect(presenceFor(false, 3)).toBe('party');
		expect(presenceFor(true, 1)).toBe('solo');
		expect(presenceFor(true, 2)).toBe('coop');
	});

	it('matches the tokens uploaded to Steam (deploy/steam/rich_presence_english.vdf)', () => {
		const vdf = readFileSync(
			new URL('../../../deploy/steam/rich_presence_english.vdf', import.meta.url),
			'utf8'
		);
		const tokens = [...vdf.matchAll(/"(#\w+)"\s+"([^"]*)"/g)].map(([, token, text]) => ({
			token,
			text
		}));
		expect(tokens).toEqual(Object.values(PRESENCE).map(({ token, text }) => ({ token, text })));
	});
});
