import type { Db } from 'mongodb';
import { ITEMS } from '../../content/items.ts';
import { discoverable, foundIn } from '../../shared/items/crafting.ts';
import type { ExplorerDoc } from './accounts.ts';

/**
 * Discoveries (docs/dev/crafting.md#discovery): what an explorer has seen in a lootable, kept for
 * good on their explorer, with where. The game server writes them as they happen; the Library and
 * the Workshop read them. Newly discovered items are `fresh` until looked at.
 */

const explorers = (db: Db) => db.collection<ExplorerDoc>('explorers');

/** A discovery: an item, and the lootable kind it was seen in. */
export interface Find {
	item: string;
	source: string;
}

/** Record what was seen. Items new to them become fresh. */
export async function discover(db: Db, explorerId: string, finds: Find[]): Promise<void> {
	const wanted = finds.filter((f) => discoverable(f.item));
	if (!wanted.length) return;
	const before = await explorers(db).findOne(
		{ _id: explorerId },
		{ projection: { discovered: 1 } }
	);
	const known = before?.discovered ?? {};
	const addToSet: Record<string, unknown> = {};
	for (const { item, source } of wanted) {
		const key = `discovered.${item}`;
		const list = (addToSet[key] as { $each: string[] } | undefined)?.$each ?? [];
		if (!list.includes(source)) list.push(source);
		addToSet[key] = { $each: list };
	}
	const fresh = [...new Set(wanted.map((f) => f.item))].filter((item) => !known[item]);
	if (fresh.length) addToSet.fresh = { $each: fresh };
	await explorers(db).updateOne({ _id: explorerId }, { $addToSet: addToSet });
}

/** What these explorers have discovered (for the game server, at descent). */
export async function discoveredOf(
	db: Db,
	explorerIds: string[]
): Promise<Map<string, Set<string>>> {
	const out = new Map<string, Set<string>>();
	const docs = await explorers(db)
		.find({ _id: { $in: explorerIds } }, { projection: { discovered: 1 } })
		.toArray();
	for (const doc of docs) out.set(doc._id, new Set(Object.keys(doc.discovered ?? {})));
	return out;
}

/** They have looked at these: no longer fresh. */
export async function seen(db: Db, explorerId: string, items: string[]): Promise<void> {
	await explorers(db).updateOne({ _id: explorerId }, { $pull: { fresh: { $in: items } } });
}

/** Admin: discover everything there is to discover (where each can be found). */
export async function discoverAll(db: Db, explorerId: string): Promise<void> {
	const discovered: Record<string, string[]> = {};
	for (const item of Object.keys(ITEMS)) if (discoverable(item)) discovered[item] = foundIn(item);
	await explorers(db).updateOne({ _id: explorerId }, { $set: { discovered, fresh: [] } });
}

/** Admin: forget every discovery. */
export async function resetDiscoveries(db: Db, explorerId: string): Promise<void> {
	await explorers(db).updateOne({ _id: explorerId }, { $set: { discovered: {}, fresh: [] } });
}

/** Admin: set the merchant's trust (coin sold, in all). */
export async function setTrust(db: Db, explorerId: string, sold: number): Promise<void> {
	await explorers(db).updateOne(
		{ _id: explorerId },
		{ $set: { sold: Math.max(0, Math.floor(sold)) } }
	);
}
