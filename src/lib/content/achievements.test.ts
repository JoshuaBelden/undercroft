import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	ACHIEVEMENTS,
	achievementsForBanishing,
	achievementsForRite,
	achievementsForRun
} from './achievements.ts';

describe('achievements', () => {
	it('have unique Steam API names', () => {
		const ids = ACHIEVEMENTS.map(({ id }) => id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[A-Z0-9_]{1,64}$/);
	});

	it('are earned by how a run ends and how many were in it', () => {
		expect(achievementsForRun('extracted', 1)).toEqual(['FIRST_EXTRACTION']);
		expect(achievementsForRun('extracted', 3)).toEqual(['FIRST_EXTRACTION', 'COOP_EXTRACTION']);
		for (const outcome of ['died', 'lost', 'abandoned', 'left', 'banished'] as const) {
			expect(achievementsForRun(outcome, 4)).toEqual([]);
		}
	});

	it('include one for the rite, and one for banishing what it summoned', () => {
		expect(achievementsForRite()).toEqual(['RITE_PERFORMED']);
		expect(achievementsForBanishing()).toEqual(['BANISHED']);
	});
});

describe('the Steamworks list (deploy/steam/achievements.md)', () => {
	it('has every achievement, by its API name, display name and description', () => {
		const list = readFileSync(
			new URL('../../../deploy/steam/achievements.md', import.meta.url),
			'utf8'
		);
		const rows = list.split('\n').filter((line) => line.startsWith('| `'));
		expect(rows).toHaveLength(ACHIEVEMENTS.length);
		for (const { id, name, description } of ACHIEVEMENTS) {
			const row = rows.find((line) => line.includes(`\`${id}\``));
			expect(row, id).toBeDefined();
			expect(row).toContain(name);
			expect(row).toContain(description);
		}
	});
});
