import { QUEST_ORDER } from '../../content/quests.ts';
import { emptyRecord } from '../quests/engine.ts';
import type { QuestRecord } from '../quests/types.ts';

/**
 * A quest record with every quest before `quest` (in QUEST_ORDER) reported done, in order, a
 * second apart: Fontaine's quests open one at a time, so `quest` is the one open.
 */
export function upTo(quest: string): QuestRecord {
	const at = QUEST_ORDER.indexOf(quest);
	if (at < 0) throw new Error(`No quest ${quest}`);
	const record = emptyRecord();
	QUEST_ORDER.slice(0, at).forEach((id, i) => {
		record.quests[id] = { counts: [], committed: {}, done: 1000 + i };
	});
	return record;
}
