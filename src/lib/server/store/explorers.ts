import type { Collection, Db } from 'mongodb';
import { ITEMS } from '../../content/items.ts';
import {
	addItem,
	allStacks,
	emptyInventory,
	removeItem,
	takeStack
} from '../../shared/items/inventory.ts';
import type { ItemRef } from '../../shared/items/types.ts';
import type { Inventory, ItemStack } from '../../shared/player/types.ts';
import type { ExplorerDoc } from './accounts.ts';

/**
 * What an explorer owns between expeditions: the stash (kept on the surface) and the loadout
 * (what goes down next). The site changes them from the hub; the game server takes the loadout
 * at descent and hands back what was carried out. Only one of them writes at a time: an explorer
 * marked `underground` can't be changed from the hub. See docs/dev/economy.md.
 */

export type ExplorerError = 'underground' | 'missing' | 'noRoom' | 'busy';

export const EXPLORER_ERRORS: Record<ExplorerError, string> = {
	underground: "You can't do that while you're underground",
	missing: "That isn't there any more",
	noRoom: "That doesn't fit: too heavy, or no room for it",
	busy: 'Something else changed at the same time. Try again'
};

const explorers = (db: Db): Collection<ExplorerDoc> => db.collection<ExplorerDoc>('explorers');

/** Item kinds that never stay in a loadout: they go to the stash when you come back up. */
const NOT_KIT = new Set(['loot', 'rite', 'clue']);

/** Put a stack in a stash, joining one of the same item unless it has its own state. */
export function addToStash(stash: ItemStack[], stack: ItemStack): void {
	if (stack.count <= 0) return;
	const plain = stack.loaded === undefined && stack.uses === undefined;
	const entry = plain
		? stash.find((s) => s.item === stack.item && s.loaded === undefined && s.uses === undefined)
		: undefined;
	if (entry) entry.count += stack.count;
	else stash.push({ ...stack });
}

/**
 * Change an explorer from the hub. `change` edits a copy and returns an error to refuse. The
 * write only lands if nothing else changed the explorer meanwhile, and never while underground.
 */
export async function changeExplorer(
	db: Db,
	explorerId: string,
	change: (explorer: ExplorerDoc) => ExplorerError | null
): Promise<{ explorer: ExplorerDoc } | { error: ExplorerError }> {
	const before = await explorers(db).findOne({ _id: explorerId });
	if (!before) return { error: 'missing' };
	if (before.underground !== null) return { error: 'underground' };
	const after: ExplorerDoc = structuredClone(before);
	const error = change(after);
	if (error) return { error };
	const result = await explorers(db).updateOne(
		{ _id: explorerId, underground: null, money: before.money, stash: before.stash },
		{ $set: { money: after.money, stash: after.stash, loadout: after.loadout } }
	);
	return result.matchedCount === 1 ? { explorer: after } : { error: 'busy' };
}

/** Stash to loadout: as many of the stack as will fit, up to `count`. */
export function takeFromStash(
	db: Db,
	explorerId: string,
	index: number,
	count: number
): Promise<{ explorer: ExplorerDoc } | { error: ExplorerError }> {
	return changeExplorer(db, explorerId, (explorer) => {
		const stack = explorer.stash[index];
		if (!stack || !ITEMS[stack.item]) return 'missing';
		const wanted = Math.max(1, Math.min(stack.count, Math.floor(count)));
		const left = addItem(explorer.loadout, { ...stack, count: wanted });
		const moved = wanted - left;
		if (moved <= 0) return 'noRoom';
		if (moved >= stack.count) explorer.stash.splice(index, 1);
		else stack.count -= moved;
		return null;
	});
}

/** Loadout to stash. */
export function stowInStash(
	db: Db,
	explorerId: string,
	from: ItemRef,
	count: number
): Promise<{ explorer: ExplorerDoc } | { error: ExplorerError }> {
	return changeExplorer(db, explorerId, (explorer) => {
		const stack = takeStack(explorer.loadout, from, count);
		if (!stack) return 'missing';
		addToStash(explorer.stash, stack);
		return null;
	});
}

/**
 * Descent: the loadout leaves the explorer and they are marked as underground in this
 * expedition. Returns what they carry down (nothing, if the explorer is missing or already
 * marked: that should not happen, and they go down empty-handed rather than with a copy).
 */
export async function takeLoadout(db: Db, explorerId: string, session: string): Promise<Inventory> {
	const before = await explorers(db).findOneAndUpdate(
		{ _id: explorerId, underground: null },
		{ $set: { underground: session, loadout: emptyInventory() } },
		{ returnDocument: 'before' }
	);
	return before?.loadout ?? emptyInventory();
}

/**
 * Back from an expedition. `carried` is what they brought out (null if they died or were lost:
 * it stays in the catacombs). Their kit stays arranged as their loadout for next time; loot and
 * rite items go to the stash.
 */
export async function returnFromExpedition(
	db: Db,
	explorerId: string,
	session: string,
	carried: Inventory | null
): Promise<void> {
	if (!carried) {
		await explorers(db).updateOne(
			{ _id: explorerId, underground: session },
			{ $set: { underground: null } }
		);
		return;
	}
	const explorer = await explorers(db).findOne({ _id: explorerId, underground: session });
	if (!explorer) return;
	const loadout = structuredClone(carried);
	loadout.selected = 0;
	const stash = explorer.stash;
	for (const stack of allStacks(loadout)) {
		if (!NOT_KIT.has(ITEMS[stack.item]?.kind ?? '')) continue;
		removeItem(loadout, stack.item, stack.count);
		addToStash(stash, stack);
	}
	await explorers(db).updateOne(
		{ _id: explorerId, underground: session },
		{ $set: { underground: null, loadout, stash } }
	);
}

/**
 * Nobody is underground when the game server starts: clear markers a crash left behind, so
 * those explorers aren't locked out of the hub. (What they carried is gone.)
 */
export async function clearUnderground(db: Db): Promise<number> {
	const result = await explorers(db).updateMany(
		{ underground: { $ne: null } },
		{ $set: { underground: null } }
	);
	return result.modifiedCount;
}
