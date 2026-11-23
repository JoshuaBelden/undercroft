/**
 * The quest engine (docs/dev/quests.md): pure rules over the data in src/lib/content/quests.ts.
 * The game server feeds it events from below (`advance`), the hub commits and reports (`commit`,
 * `report`), and both ask it what is open. Nothing here touches the database or a session.
 */
import { QUESTS } from '../../content/quests.ts';
import { TASKS } from '../../content/tasks.ts';
import type {
	Condition,
	Objective,
	QuestBrief,
	QuestDef,
	QuestEvent,
	QuestProgress,
	QuestRecord,
	QuestStatus
} from './types.ts';

/** What the engine needs to know besides the record: which Afflictions the explorer resolved. */
export interface QuestContext {
	resolved: (affliction: string) => boolean;
}

const NONE: QuestContext = { resolved: () => false };

export function emptyRecord(): QuestRecord {
	return { quests: {}, flags: [] };
}

/** How far an objective goes: its `count`, or 1. */
export function objectiveCount(objective: Objective): number {
	return 'count' in objective ? objective.count : 1;
}

function progressOf(record: QuestRecord, quest: QuestDef): QuestProgress {
	return (
		record.quests[quest.id] ?? {
			counts: quest.objectives.map(() => 0),
			committed: {}
		}
	);
}

export function isDone(record: QuestRecord, quest: string): boolean {
	return record.quests[quest]?.done !== undefined;
}

export function test(
	condition: Condition,
	record: QuestRecord,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): boolean {
	switch (condition.kind) {
		case 'done':
			return isDone(record, condition.quest);
		case 'open':
			return isOpen(record, condition.quest, context, defs);
		case 'flag':
			return record.flags.includes(condition.flag);
		case 'resolved':
			return context.resolved(condition.affliction);
		case 'all':
			return condition.of.every((c) => test(c, record, context, defs));
		case 'any':
			return condition.of.some((c) => test(c, record, context, defs));
	}
}

/** Offered (its `requires` holds) and not yet done. */
export function isOpen(
	record: QuestRecord,
	quest: string,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): boolean {
	const def = defs[quest];
	if (!def || isDone(record, quest)) return false;
	return !def.requires || test(def.requires, record, context, defs);
}

/** Every quest open for the explorer, in data order. */
export function openQuests(
	record: QuestRecord,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): QuestDef[] {
	return Object.values(defs).filter((def) => isOpen(record, def.id, context, defs));
}

/** Every objective met. */
export function objectivesMet(record: QuestRecord, def: QuestDef): boolean {
	const progress = progressOf(record, def);
	return def.objectives.every((o, i) => (progress.counts[i] ?? 0) >= objectiveCount(o));
}

/** Still to commit, by item. */
export function stillToCommit(
	record: QuestRecord,
	def: QuestDef
): { item: string; count: number }[] {
	const progress = progressOf(record, def);
	return def.commit
		.map((c) => ({ item: c.item, count: c.count - (progress.committed[c.item] ?? 0) }))
		.filter((c) => c.count > 0);
}

export function status(
	record: QuestRecord,
	quest: string,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): QuestStatus | null {
	const def = defs[quest];
	if (!def) return null;
	if (isDone(record, quest)) return 'done';
	if (!isOpen(record, quest, context, defs)) return null;
	return objectivesMet(record, def) && stillToCommit(record, def).length === 0 ? 'ready' : 'open';
}

function matches(objective: Objective, event: QuestEvent): boolean {
	switch (objective.kind) {
		case 'extract':
			return event.kind === 'extract' && event.affliction === objective.affliction;
		case 'reach':
			return (
				event.kind === 'reach' &&
				event.affliction === objective.affliction &&
				event.level >= objective.level
			);
		case 'loot':
			return (
				event.kind === 'loot' &&
				(!objective.affliction || event.affliction === objective.affliction)
			);
		case 'craft':
			return event.kind === 'craft' && event.recipe === objective.recipe;
		case 'kill':
			return (
				event.kind === 'kill' &&
				event.creature === objective.creature &&
				(!objective.affliction || event.affliction === objective.affliction)
			);
		case 'task':
			return event.kind === 'task' && event.task === objective.task;
		case 'resolve':
			return event.kind === 'resolve' && event.affliction === objective.affliction;
	}
}

/**
 * One event from below, applied to one explorer's record: every open quest's matching objectives
 * count up (to their count), and a `flag` event sets its flag. Returns the new record, or null
 * when nothing changed. In co-op the server applies each event to everyone there: objectives are
 * shared, commitments are not.
 */
export function advance(
	record: QuestRecord,
	event: QuestEvent,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): QuestRecord | null {
	let changed = false;
	const next: QuestRecord = { quests: { ...record.quests }, flags: [...record.flags] };
	if (event.kind === 'flag' && !next.flags.includes(event.flag)) {
		next.flags.push(event.flag);
		changed = true;
	}
	for (const def of openQuests(record, context, defs)) {
		const progress = progressOf(record, def);
		let counts: number[] | null = null;
		def.objectives.forEach((objective, i) => {
			const now = progress.counts[i] ?? 0;
			if (now >= objectiveCount(objective) || !matches(objective, event)) return;
			counts ??= def.objectives.map((_, j) => progress.counts[j] ?? 0);
			counts[i] = now + 1;
		});
		if (counts) {
			next.quests[def.id] = { ...progress, counts };
			changed = true;
		}
	}
	return changed ? next : null;
}

/**
 * Commit `count` of `item` to an open quest: how many it takes (up to what is still wanted), and
 * the new record. Zero when the quest is not open or doesn't want it.
 */
export function commit(
	record: QuestRecord,
	quest: string,
	item: string,
	count: number,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): { taken: number; record: QuestRecord } {
	const def = defs[quest];
	if (!def || !isOpen(record, quest, context, defs)) return { taken: 0, record };
	const wanted = stillToCommit(record, def).find((c) => c.item === item)?.count ?? 0;
	const taken = Math.max(0, Math.min(wanted, Math.floor(count)));
	if (taken === 0) return { taken: 0, record };
	const progress = progressOf(record, def);
	return {
		taken,
		record: {
			...record,
			quests: {
				...record.quests,
				[quest]: {
					...progress,
					committed: { ...progress.committed, [item]: (progress.committed[item] ?? 0) + taken }
				}
			}
		}
	};
}

/**
 * Report a ready quest to its NPC: it is done, and its flags are set. Null when it isn't ready.
 * The reward is the caller's to give (coins, items and experience live elsewhere).
 */
export function report(
	record: QuestRecord,
	quest: string,
	now: number,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): QuestRecord | null {
	const def = defs[quest];
	if (!def || status(record, quest, context, defs) !== 'ready') return null;
	const flags = [...record.flags];
	for (const flag of def.sets ?? []) if (!flags.includes(flag)) flags.push(flag);
	return {
		flags,
		quests: { ...record.quests, [quest]: { ...progressOf(record, def), done: now } }
	};
}

/** Recipes the explorer knows from quests: taught by any quest open or done. */
export function learnedRecipes(
	record: QuestRecord,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): string[] {
	return Object.values(defs)
		.filter((def) => isDone(record, def.id) || isOpen(record, def.id, context, defs))
		.flatMap((def) => def.teachesRecipes ?? []);
}

/** Room tasks of the explorer's open quests whose objective isn't met yet. */
export function openTasks(
	record: QuestRecord,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): string[] {
	const tasks: string[] = [];
	for (const def of openQuests(record, context, defs)) {
		const progress = progressOf(record, def);
		def.objectives.forEach((o, i) => {
			if (o.kind === 'task' && (progress.counts[i] ?? 0) < 1) tasks.push(o.task);
		});
	}
	return tasks;
}

/** Rooms the map must have for these explorers: those of their open room tasks. */
export function includedRooms(records: QuestRecord[], context: QuestContext[] = []): string[] {
	const rooms = new Set<string>();
	records.forEach((record, i) => {
		for (const task of openTasks(record, context[i] ?? NONE)) {
			const room = TASKS[task]?.room;
			if (room) rooms.add(room);
		}
	});
	return [...rooms];
}

/** Casebook pages earned, in the order earned. */
export function casebook(record: QuestRecord, defs: Record<string, QuestDef> = QUESTS): string[] {
	return Object.entries(record.quests)
		.filter(([id, p]) => p.done !== undefined && defs[id])
		.sort((a, b) => a[1].done! - b[1].done!)
		.map(([id]) => id);
}

/** The open (and ready) quests in short form, for the HUD. */
export function briefs(
	record: QuestRecord,
	context: QuestContext = NONE,
	defs: Record<string, QuestDef> = QUESTS
): QuestBrief[] {
	return openQuests(record, context, defs).map((def) => {
		const progress = progressOf(record, def);
		return {
			id: def.id,
			title: def.title,
			status: status(record, def.id, context, defs) ?? 'open',
			objectives: def.objectives.map((o, i) => ({
				text: o.text.text,
				count: Math.min(progress.counts[i] ?? 0, objectiveCount(o)),
				of: objectiveCount(o)
			})),
			bring: stillToCommit(record, def)
		};
	});
}
