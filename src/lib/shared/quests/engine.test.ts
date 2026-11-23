import { describe, expect, it } from 'vitest';
import { MIDDLE, QUESTS } from '../../content/quests.ts';
import { upTo } from '../testing/quests.ts';
import {
	advance,
	briefs,
	canComplete,
	research,
	commit,
	emptyRecord,
	includedRooms,
	isOpen,
	learnedRecipes,
	openQuests,
	openTasks,
	report,
	status,
	test as holds,
	trackedQuest
} from './engine.ts';
import type { QuestDef, QuestEvent, QuestRecord } from './types.ts';

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
	it('opens them one at a time, in order', () => {
		expect(openQuests(emptyRecord()).map((q) => q.id)).toEqual(['fontaine']);
		const order = ['fontaine', ...MIDDLE, 'last-procession'];
		order.slice(1).forEach((id, i) => {
			const before = doneWith(...order.slice(0, i + 1));
			expect(openQuests(before).map((q) => q.id)).toEqual([id]);
		});
		expect(isOpen(doneWith('fontaine', ...MIDDLE.slice(0, -1)), 'last-procession')).toBe(false);
	});

	it('opens several together when they ask for the same thing', () => {
		// Fontaine's middle eight as if each needed only the first: all open at once.
		const together: Record<string, QuestDef> = Object.fromEntries(
			Object.entries(QUESTS).map(([id, def]) => [
				id,
				MIDDLE.includes(id) ? { ...def, requires: { kind: 'done', quest: 'fontaine' } } : def
			])
		);
		const record = doneWith('fontaine');
		expect(openQuests(record, undefined, together).map((q) => q.id)).toEqual(MIDDLE);
		const event: QuestEvent = { kind: 'reach', affliction: 'gloaming', level: 3 };
		const moved = advance(record, event, undefined, together)!;
		expect(moved.quests['carters-road'].counts).toEqual([1, 0]);
		expect(moved.quests['what-they-took'].counts).toEqual([0, 1, 0]);
	});

	it('never shows a locked quest', () => {
		expect(status(emptyRecord(), 'moved-dead')).toBeNull();
		expect(briefs(emptyRecord()).map((b) => b.id)).toEqual(['fontaine']);
	});
});

describe('advancing', () => {
	it('counts matching events for open quests only, up to the count', () => {
		let record = upTo('moved-dead');
		for (let i = 0; i < 10; i++) record = apply(record, { kind: 'loot', affliction: 'gloaming' });
		expect(record.quests['moved-dead'].counts).toEqual([8]);
		// Rumors loot counts for nothing that asks for the Gloaming's.
		expect(advance(upTo('moved-dead'), { kind: 'loot', affliction: 'rumors' })).toBeNull();
		// A locked quest doesn't count.
		expect(
			advance(emptyRecord(), { kind: 'kill', creature: 'witch', affliction: 'gloaming' })
		).toBeNull();
	});

	it('reaching a level counts any objective at or above it', () => {
		const deep: QuestEvent = { kind: 'reach', affliction: 'gloaming', level: 3 };
		expect(apply(upTo('carters-road'), deep).quests['carters-road'].counts).toEqual([1, 0]);
		expect(apply(upTo('what-they-took'), deep).quests['what-they-took'].counts).toEqual([0, 1, 0]);
	});

	it('the same event moves everyone in a party on (objectives are shared)', () => {
		const a = upTo('carters-road');
		const b = upTo('carters-road');
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

describe('complete but for committing', () => {
	it('is objectives met and what is still wanted in hand', () => {
		const def = QUESTS['moved-dead'];
		const searched = apply(
			upTo('moved-dead'),
			...Array.from({ length: 8 }, (): QuestEvent => ({ kind: 'loot', affliction: 'gloaming' }))
		);
		const rosaries = (n: number) => (item: string) => (item === 'rosary' ? n : 0);
		expect(canComplete(upTo('moved-dead'), def, rosaries(1))).toBe(false);
		expect(canComplete(searched, def, rosaries(0))).toBe(false);
		expect(canComplete(searched, def, rosaries(1))).toBe(true);
		expect(canComplete(commit(searched, 'moved-dead', 'rosary', 1).record, def, rosaries(0))).toBe(
			true
		);
	});
});

describe('committing and reporting', () => {
	it('takes only what is still wanted, and readies the quest once objectives are met', () => {
		let record = upTo('by-candle');
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
		expect(research(record)).toEqual(['fontaine', 'carriers', 'moved-dead']);
	});
});

describe('tracking', () => {
	it('follows the chosen quest while it is open, else the first open', () => {
		expect(trackedQuest(['a', 'b'], 'b')).toBe('b');
		expect(trackedQuest(['a', 'b'], null)).toBe('a');
		expect(trackedQuest(['a', 'b'], 'gone')).toBe('a');
		expect(trackedQuest([], 'a')).toBeNull();
	});
});

describe('what the map and the kit need', () => {
	it('open room tasks name their rooms, until done', () => {
		expect(openTasks(upTo('carters-road'))).toEqual(['carters-bell']);
		const record = upTo('what-they-took');
		expect(openTasks(record)).toEqual(['bricked-niche']);
		expect(includedRooms([record])).toContain('saints-crypt');
		// A party with different quests open needs every one's rooms.
		expect(includedRooms([upTo('sunken-box'), record]).sort()).toEqual(
			['cistern', 'saints-crypt'].sort()
		);
		const niche = apply(record, { kind: 'task', task: 'bricked-niche' });
		expect(includedRooms([niche])).not.toContain('saints-crypt');
		expect(includedRooms([emptyRecord()])).toEqual([]);
	});

	it('the charge is taught once its quest is open, and stays known', () => {
		expect(learnedRecipes(emptyRecord())).toEqual([]);
		expect(learnedRecipes(upTo('sunken-box'))).toEqual([]);
		expect(learnedRecipes(upTo('what-they-took'))).toEqual(['quarrymans-charge']);
		expect(learnedRecipes(upTo('last-procession'))).toEqual(['quarrymans-charge']);
	});
});
