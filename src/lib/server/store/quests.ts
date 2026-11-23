import type { Db } from 'mongodb';
import { ITEMS } from '../../content/items.ts';
import { NPCS } from '../../content/npcs.ts';
import { QUESTS } from '../../content/quests.ts';
import {
	getSlot,
	newStack,
	addToSlots,
	sanitizeRef,
	takeStack
} from '../../shared/items/inventory.ts';
import {
	advance,
	commit as commitTo,
	emptyRecord,
	report as reportTo,
	test,
	type QuestContext
} from '../../shared/quests/engine.ts';
import type { QuestEvent, QuestRecord } from '../../shared/quests/types.ts';
import type { ExplorerDoc } from './accounts.ts';
import { changeExplorer, type ExplorerError } from './explorers.ts';
import { addExperience } from './progression.ts';
import { log } from './shop.ts';

/**
 * Quests on the surface (docs/dev/quests.md): committing what was brought back, reporting a quest
 * done for its reward, and buying from an NPC. The game server moves objectives on as things
 * happen below (`advanceQuests`). Rules are the engine's (src/lib/shared/quests/engine.ts).
 */

type Result = Promise<{ explorer: ExplorerDoc } | { error: ExplorerError }>;

const explorers = (db: Db) => db.collection<ExplorerDoc>('explorers');

/** Which Afflictions an explorer has resolved (or, for training, got out of). */
export async function resolvedBy(db: Db, explorerId: string): Promise<string[]> {
	const docs = await db
		.collection<{ player: string; affliction: string; resolved?: boolean }>('progress')
		.find({ player: explorerId, resolved: true })
		.toArray();
	return docs.map((doc) => doc.affliction);
}

export function contextOf(resolved: string[]): QuestContext {
	return { resolved: (affliction) => resolved.includes(affliction) };
}

/**
 * An explorer's quest record. One from before quests were kept starts at the first quest, with
 * its objective already met if they have been through Rumors, so they can report it for its
 * reward.
 */
export function questsOf(explorer: Pick<ExplorerDoc, 'quests'>, resolved: string[]): QuestRecord {
	if (explorer.quests) return explorer.quests;
	const record = emptyRecord();
	if (resolved.includes('rumors')) record.quests.fontaine = { counts: [1], committed: {} };
	return record;
}

/**
 * The game server: things done below moved this explorer's quests on. Kept at once (not at the
 * end of the run): a task done stays done even if they die after. Returns the record kept.
 */
export async function advanceQuests(
	db: Db,
	explorerId: string,
	events: QuestEvent[]
): Promise<QuestRecord | null> {
	const explorer = await explorers(db).findOne({ _id: explorerId });
	if (!explorer) return null;
	const resolved = await resolvedBy(db, explorerId);
	const context = contextOf(resolved);
	let record = questsOf(explorer, resolved);
	let changed = false;
	for (const event of events) {
		const next = advance(record, event, context);
		if (next) {
			record = next;
			changed = true;
		}
	}
	// Only the game server writes quests while the explorer is underground: the hub can't.
	if (changed) await explorers(db).updateOne({ _id: explorerId }, { $set: { quests: record } });
	return record;
}

/**
 * Commit a stack (from the stash or the loadout) to an open quest: as much of it as is still
 * wanted is used up. Lent things (the free loadout) can't be.
 */
export async function commitQuest(
	db: Db,
	explorerId: string,
	quest: unknown,
	from: unknown
): Result {
	const at = sanitizeRef(from, true);
	if (typeof quest !== 'string' || !QUESTS[quest] || !at) return { error: 'unwanted' };
	const resolved = await resolvedBy(db, explorerId);
	let given = { item: '', count: 0 };
	const result = await changeExplorer(db, explorerId, (explorer) => {
		const belongings = { inventory: explorer.loadout, stash: explorer.stash };
		const stack = getSlot(belongings, at);
		if (!stack) return 'missing';
		if (stack.free) return 'lent';
		const { taken, record } = commitTo(
			questsOf(explorer, resolved),
			quest,
			stack.item,
			stack.count,
			contextOf(resolved)
		);
		if (taken === 0) return 'unwanted';
		takeStack(belongings, at, taken);
		explorer.quests = record;
		given = { item: stack.item, count: taken };
		return null;
	});
	if ('explorer' in result)
		await log(db, {
			explorer: explorerId,
			kind: 'quest',
			...given,
			money: 0,
			balance: result.explorer.money
		});
	return result;
}

/** Report a ready quest: it is done, its page is earned, and its reward given. */
export async function reportQuest(db: Db, explorerId: string, quest: unknown): Result {
	const def = typeof quest === 'string' ? QUESTS[quest] : undefined;
	if (!def) return { error: 'notReady' };
	const resolved = await resolvedBy(db, explorerId);
	const reward = def.reward ?? {};
	const result = await changeExplorer(db, explorerId, (explorer) => {
		const record = reportTo(questsOf(explorer, resolved), def.id, Date.now(), contextOf(resolved));
		if (!record) return 'notReady';
		const stash = explorer.stash.map((stack) => (stack ? { ...stack } : null));
		for (const r of reward.items ?? [])
			if (addToSlots(stash, newStack(r.item, r.count)) > 0) return 'stashFull';
		explorer.stash = stash;
		explorer.money += reward.coins ?? 0;
		explorer.quests = record;
		return null;
	});
	if ('explorer' in result) {
		await addExperience(db, explorerId, reward.xp ?? 0, [`quest:${def.id}`]);
		if (reward.coins)
			await log(db, {
				explorer: explorerId,
				kind: 'quest',
				money: reward.coins,
				balance: result.explorer.money
			});
	}
	return result;
}

/** Buy something an NPC sells, once its `when` holds. */
export async function buyFromNpc(db: Db, explorerId: string, npc: unknown, item: unknown): Result {
	const def = typeof npc === 'string' ? NPCS[npc] : undefined;
	const sale = def?.sells.find((s) => s.item === item);
	if (!def || !sale || !ITEMS[sale.item]) return { error: 'unsold' };
	const resolved = await resolvedBy(db, explorerId);
	const result = await changeExplorer(db, explorerId, (explorer) => {
		if (sale.when && !test(sale.when, questsOf(explorer, resolved), contextOf(resolved)))
			return 'unsold';
		if (explorer.money < sale.price) return 'money';
		const stash = explorer.stash.map((stack) => (stack ? { ...stack } : null));
		if (addToSlots(stash, newStack(sale.item, 1)) > 0) return 'stashFull';
		explorer.stash = stash;
		explorer.money -= sale.price;
		return null;
	});
	if ('explorer' in result)
		await log(db, {
			explorer: explorerId,
			kind: 'buy',
			item: sale.item,
			count: 1,
			money: -sale.price,
			balance: result.explorer.money
		});
	return result;
}

/** Admin: set an explorer's quest record outright (null: start over). */
export async function setQuests(
	db: Db,
	explorerId: string,
	record: QuestRecord | null
): Promise<void> {
	await explorers(db).updateOne(
		{ _id: explorerId },
		record ? { $set: { quests: record } } : { $unset: { quests: '' } }
	);
}

/**
 * Admin: one quest's state for an explorer. `done`: reported (no reward paid); `met`: every
 * objective met and everything committed, ready to report for its reward; `open`: back to the
 * start (its progress forgotten).
 */
export async function adminSetQuest(
	db: Db,
	explorerId: string,
	quest: string,
	state: 'done' | 'met' | 'open'
): Promise<boolean> {
	const def = QUESTS[quest];
	const explorer = await explorers(db).findOne({ _id: explorerId });
	if (!def || !explorer) return false;
	const record = structuredClone(questsOf(explorer, await resolvedBy(db, explorerId)));
	if (state === 'open') delete record.quests[quest];
	else {
		record.quests[quest] = {
			counts: def.objectives.map((o) => ('count' in o ? o.count : 1)),
			committed: Object.fromEntries(def.commit.map((c) => [c.item, c.count])),
			...(state === 'done' ? { done: Date.now() } : {})
		};
		if (state === 'done')
			for (const flag of def.sets ?? []) if (!record.flags.includes(flag)) record.flags.push(flag);
	}
	await setQuests(db, explorerId, record);
	return true;
}

/** Admin: set or clear a flag on an explorer. */
export async function adminSetFlag(
	db: Db,
	explorerId: string,
	flag: string,
	on: boolean
): Promise<void> {
	const explorer = await explorers(db).findOne({ _id: explorerId });
	if (!explorer || !flag) return;
	const record = structuredClone(questsOf(explorer, await resolvedBy(db, explorerId)));
	record.flags = record.flags.filter((f) => f !== flag);
	if (on) record.flags.push(flag);
	await setQuests(db, explorerId, record);
}
