import { describe, expect, it } from 'vitest';
import { MIDDLE } from '../../content/quests.ts';
import {
	advance,
	briefs,
	casebook,
	commit,
	emptyRecord,
	includedRooms,
	isOpen,
	learnedRecipes,
	openQuests,
	openTasks,
	report,
	status,
	test as holds
} from './engine.ts';
import type { QuestEvent, QuestRecord } from './types.ts';

function apply(record: QuestRecord, ...events: QuestEvent[]): QuestRecord {
	for (const event of events) record = advance(record, event) ?? record;
	return record;
}

/** A record with `quests` reported done, in order, a second apart. */
function doneWith(...quests: string[]): QuestRecord {
	const record = emptyRecord();
	quests.forEach((id, i) => {
		record.quests[id] = { counts: [], committed: {}, done: 1000 + i };
	});
	return record;
}

describe('quest order', () => {
	it('opens the first quest alone, then the eight together, then the last', () => {
		expect(openQuests(emptyRecord()).map((q) => q.id)).toEqual(['fontaine']);
		const afterFirst = doneWith('fontaine');
		expect(openQuests(afterFirst).map((q) => q.id)).toEqual(MIDDLE);
		const almost = doneWith('fontaine', ...MIDDLE.slice(1));
		expect(isOpen(almost, 'last-procession')).toBe(false);
		const all = doneWith('fontaine', ...MIDDLE);
		expect(openQuests(all).map((q) => q.id)).toEqual(['last-procession']);
	});

	it('never shows a locked quest', () => {
		expect(status(emptyRecord(), 'moved-dead')).toBeNull();
		expect(briefs(emptyRecord()).map((b) => b.id)).toEqual(['fontaine']);
	});
});

describe('advancing', () => {
	it('counts matching events for open quests only, up to the count', () => {
		let record = doneWith('fontaine');
		for (let i = 0; i < 10; i++) record = apply(record, { kind: 'loot', affliction: 'gloaming' });
		expect(record.quests['moved-dead'].counts).toEqual([8]);
		// Rumors loot counts for nothing that asks for the Gloaming's.
		expect(advance(doneWith('fontaine'), { kind: 'loot', affliction: 'rumors' })).toBeNull();
		// A locked quest doesn't count.
		expect(
			advance(emptyRecord(), { kind: 'kill', creature: 'witch', affliction: 'gloaming' })
		).toBeNull();
	});

	it('reaching a level counts any objective at or above it', () => {
		const record = apply(doneWith('fontaine'), { kind: 'reach', affliction: 'gloaming', level: 3 });
		expect(record.quests['carters-road'].counts).toEqual([1, 0]);
		expect(record.quests['what-they-took'].counts).toEqual([0, 1, 0]);
	});

	it('the same event moves everyone in a party on (objectives are shared)', () => {
		const a = doneWith('fontaine');
		const b = doneWith('fontaine');
		const event: QuestEvent = { kind: 'task', task: 'carters-bell' };
		expect(advance(a, event)!.quests['carters-road'].counts).toEqual([0, 1]);
		expect(advance(b, event)!.quests['carters-road'].counts).toEqual([0, 1]);
	});

	it('a flag event sets its flag once', () => {
		const once = advance(emptyRecord(), { kind: 'flag', flag: 'gloaming.level-3-open' })!;
		expect(once.flags).toEqual(['gloaming.level-3-open']);
		expect(advance(once, { kind: 'flag', flag: 'gloaming.level-3-open' })).toBeNull();
		expect(holds({ kind: 'flag', flag: 'gloaming.level-3-open' }, once)).toBe(true);
	});
});

describe('committing and reporting', () => {
	it('takes only what is still wanted, and readies the quest once objectives are met', () => {
		let record = doneWith('fontaine');
		const first = commit(record, 'by-candle', 'candle', 3);
		expect(first.taken).toBe(3);
		const second = commit(first.record, 'by-candle', 'candle', 9);
		expect(second.taken).toBe(2);
		expect(commit(second.record, 'by-candle', 'candle', 1).taken).toBe(0);
		expect(commit(record, 'by-candle', 'rosary', 1).taken).toBe(0);
		record = second.record;
		expect(status(record, 'by-candle')).toBe('open');
		for (let i = 0; i < 5; i++) record = apply(record, { kind: 'craft', recipe: 'candle' });
		expect(status(record, 'by-candle')).toBe('ready');
		const reported = report(record, 'by-candle', 5000)!;
		expect(status(reported, 'by-candle')).toBe('done');
		expect(report(reported, 'by-candle', 6000)).toBeNull();
	});

	it("won't commit to a quest that isn't open, or report one that isn't ready", () => {
		expect(commit(emptyRecord(), 'moved-dead', 'rosary', 1).taken).toBe(0);
		expect(report(emptyRecord(), 'fontaine', 1)).toBeNull();
		const out = apply(emptyRecord(), { kind: 'extract', affliction: 'rumors' });
		expect(report(out, 'fontaine', 1)).not.toBeNull();
	});

	it('pages come in the order earned', () => {
		const record = doneWith('fontaine', 'carriers', 'moved-dead');
		expect(casebook(record)).toEqual(['fontaine', 'carriers', 'moved-dead']);
	});
});

describe('what the map and the kit need', () => {
	it('open room tasks name their rooms, until done', () => {
		const record = doneWith('fontaine');
		expect(openTasks(record)).toEqual([
			'oath-rubbing',
			'carters-bell',
			'cistern-winch',
			'bricked-niche'
		]);
		expect(includedRooms([record])).toContain('saints-crypt');
		const niche = apply(record, { kind: 'task', task: 'bricked-niche' });
		expect(includedRooms([niche])).not.toContain('saints-crypt');
		expect(includedRooms([emptyRecord()])).toEqual([]);
	});

	it('the charge is taught once its quest is open, and stays known', () => {
		expect(learnedRecipes(emptyRecord())).toEqual([]);
		expect(learnedRecipes(doneWith('fontaine'))).toEqual(['quarrymans-charge']);
		expect(learnedRecipes(doneWith('fontaine', 'what-they-took'))).toEqual(['quarrymans-charge']);
	});
});
