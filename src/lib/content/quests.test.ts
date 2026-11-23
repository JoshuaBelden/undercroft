import { describe, expect, it } from 'vitest';
import type { Condition } from '../shared/quests/types.ts';
import { AFFLICTIONS } from './afflictions.ts';
import { CREATURES } from './creatures.ts';
import { ITEMS } from './items.ts';
import { MAP_KIT } from './map/kit.ts';
import { NPCS } from './npcs.ts';
import { QUESTS, RITE_QUEST } from './quests.ts';
import { RECIPES } from './recipes.ts';
import { TASKS } from './tasks.ts';

function conditions(condition: Condition | undefined): Condition[] {
	if (!condition) return [];
	if (condition.kind === 'all' || condition.kind === 'any')
		return [condition, ...condition.of.flatMap(conditions)];
	if (condition.kind === 'not') return [condition, ...conditions(condition.of)];
	return [condition];
}

const recipes = new Set(RECIPES.map((r) => r.id));

describe('quest data', () => {
	it('names only things that exist', () => {
		for (const quest of Object.values(QUESTS)) {
			const at = `quest ${quest.id}`;
			expect(NPCS[quest.npc], at).toBeDefined();
			expect(NPCS[quest.npc].quests, at).toContain(quest.id);
			for (const c of quest.commit) expect(ITEMS[c.item], `${at} commits ${c.item}`).toBeDefined();
			for (const r of quest.reward?.items ?? [])
				expect(ITEMS[r.item], `${at} rewards ${r.item}`).toBeDefined();
			for (const r of quest.teachesRecipes ?? [])
				expect(recipes.has(r), `${at} teaches ${r}`).toBe(true);
			for (const c of conditions(quest.requires)) {
				if (c.kind === 'done' || c.kind === 'open') expect(QUESTS[c.quest], at).toBeDefined();
				if (c.kind === 'resolved') expect(AFFLICTIONS[c.affliction], at).toBeDefined();
			}
			for (const o of quest.objectives) {
				const what = `${at}: ${o.text.id}`;
				if ('affliction' in o && o.affliction)
					expect(AFFLICTIONS[o.affliction], what).toBeDefined();
				if (o.kind === 'craft') expect(recipes.has(o.recipe), what).toBe(true);
				if (o.kind === 'kill') expect(CREATURES[o.creature], what).toBeDefined();
				if (o.kind === 'task') expect(TASKS[o.task], what).toBeDefined();
			}
		}
	});

	it('gives every line a unique id', () => {
		const ids = new Set<string>();
		const lines = [
			...Object.values(QUESTS).flatMap((q) => [
				...q.offer,
				...q.page,
				...q.objectives.map((o) => o.text)
			]),
			...Object.values(NPCS).flatMap((n) => n.greeting)
		];
		for (const line of lines) {
			expect(ids.has(line.id), line.id).toBe(false);
			expect(line.text.length, line.id).toBeGreaterThan(0);
			ids.add(line.id);
		}
	});

	it('teaches field recipes that the Library never shows', () => {
		for (const quest of Object.values(QUESTS))
			for (const id of quest.teachesRecipes ?? []) {
				const recipe = RECIPES.find((r) => r.id === id)!;
				expect(recipe.learned, id).toBe(true);
				expect(recipe.field, id).toBe(true);
			}
	});

	it('puts each task in a room the kit has, and yields a real item', () => {
		for (const task of Object.values(TASKS)) {
			expect(MAP_KIT[task.room], task.id).toBeDefined();
			if (task.yields) expect(ITEMS[task.yields.item], task.id).toBeDefined();
		}
	});

	it('has NPCs that sell real items, and a rite quest for each rite it names', () => {
		for (const npc of Object.values(NPCS)) {
			for (const q of npc.quests) expect(QUESTS[q], `${npc.id} gives ${q}`).toBeDefined();
			for (const sale of npc.sells)
				expect(ITEMS[sale.item], `${npc.id} sells ${sale.item}`).toBeDefined();
		}
		for (const [affliction, quest] of Object.entries(RITE_QUEST)) {
			expect(AFFLICTIONS[affliction]).toBeDefined();
			expect(
				QUESTS[quest].objectives.some((o) => o.kind === 'resolve' && o.affliction === affliction)
			).toBe(true);
		}
	});
});
