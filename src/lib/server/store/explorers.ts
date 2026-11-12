import type { Collection, Db } from 'mongodb';
import { allStacks, applyAction, emptyInventory } from '../../shared/items/inventory.ts';
import type { InventoryAction } from '../../shared/items/types.ts';
import type { Inventory, ItemStack } from '../../shared/player/types.ts';
import type { ExplorerDoc } from './accounts.ts';

/**
 * What an explorer owns between expeditions: the stash (kept on the surface) and the loadout
 * (what goes down next). The site changes them from the hub; the game server takes the loadout
 * at descent and hands back what was carried out. Only one of them writes at a time: an explorer
 * marked `underground` or `ready` can't be changed from the hub. See docs/dev/economy.md.
 */

export type ExplorerError =
	| 'underground'
	| 'ready'
	| 'missing'
	| 'noRoom'
	| 'heavy'
	| 'stashFull'
	| 'busy'
	| 'money'
	| 'worthless'
	| 'unsold';

export const EXPLORER_ERRORS: Record<ExplorerError, string> = {
	underground: "You can't do that while you're underground",
	ready: "You can't do that once you're ready to descend. Cancel first",
	missing: "That isn't there any more",
	noRoom: "That doesn't go there, or there is no room for it",
	heavy: 'That is more than you can carry',
	stashFull: 'Your stash is full',
	busy: 'Something else changed at the same time. Try again',
	money: "You can't afford that",
	worthless: 'No one will buy that',
	unsold: "The shop doesn't sell that"
};

const explorers = (db: Db): Collection<ExplorerDoc> => db.collection<ExplorerDoc>('explorers');

/**
 * Change an explorer from the hub. `change` edits a copy and returns an error to refuse. The
 * write only lands if nothing else changed the explorer meanwhile, and never while underground
 * or ready to descend.
 */
export async function changeExplorer(
	db: Db,
	explorerId: string,
	change: (explorer: ExplorerDoc) => ExplorerError | null
): Promise<{ explorer: ExplorerDoc } | { error: ExplorerError }> {
	const before = await explorers(db).findOne({ _id: explorerId });
	if (!before) return { error: 'missing' };
	if (before.underground !== null) return { error: 'underground' };
	if (before.ready) return { error: 'ready' };
	const after: ExplorerDoc = structuredClone(before);
	const error = change(after);
	if (error) return { error };
	const result = await explorers(db).updateOne(
		{
			_id: explorerId,
			underground: null,
			ready: { $ne: true },
			money: before.money,
			stash: before.stash,
			loadout: before.loadout
		},
		{ $set: { money: after.money, stash: after.stash, loadout: after.loadout } }
	);
	return result.matchedCount === 1 ? { explorer: after } : { error: 'busy' };
}

/**
 * A request from the Loadout page: move, equip or split something in the stash or the loadout,
 * or throw it away (`drop`: on the surface it is gone for good). `dropped` is what was thrown
 * away, for the ledger.
 */
export async function arrange(
	db: Db,
	explorerId: string,
	action: InventoryAction
): Promise<{ explorer: ExplorerDoc; dropped?: ItemStack } | { error: ExplorerError }> {
	let thrown: ItemStack | undefined;
	const result = await changeExplorer(db, explorerId, (explorer) => {
		const { result, dropped } = applyAction(
			{ inventory: explorer.loadout, stash: explorer.stash },
			action
		);
		thrown = dropped;
		if (result === 'heavy') return 'heavy';
		if (result === 'refused') return action.kind === 'drop' ? 'missing' : 'noRoom';
		return null;
	});
	return 'explorer' in result ? { ...result, dropped: thrown } : result;
}

/**
 * Descent: the loadout leaves the explorer and they are marked as underground in this
 * expedition. Returns what they carry down (nothing, if the explorer is missing or already
 * marked: that should not happen, and they go down empty-handed rather than with a copy).
 */
export async function takeLoadout(db: Db, explorerId: string, session: string): Promise<Inventory> {
	const before = await explorers(db).findOneAndUpdate(
		{ _id: explorerId, underground: null },
		{ $set: { underground: session, ready: false, loadout: emptyInventory() } },
		{ returnDocument: 'before' }
	);
	return before?.loadout ?? emptyInventory();
}

/**
 * Back from an expedition. `carried` is what they brought out (null if they died or were lost:
 * it stays in the catacombs). All of it stays as their loadout, arranged as it was: the kit is
 * ready for next time, and what they found is in the backpack for them to put away or sell.
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
	const loadout = structuredClone(carried);
	loadout.selected = 0;
	await explorers(db).updateOne(
		{ _id: explorerId, underground: session },
		{ $set: { underground: null, loadout } }
	);
}

/**
 * Ready to descend, or not any more. While it is set the hub can't change the explorer, so the
 * loadout they confirmed is the one that goes down.
 */
export async function markReady(db: Db, explorerId: string, ready: boolean): Promise<void> {
	await explorers(db).updateOne({ _id: explorerId, underground: null }, { $set: { ready } });
}

/**
 * Nobody is underground or ready when the game server starts: clear markers a crash left
 * behind, so those explorers aren't locked out of the hub. (What they carried is gone.)
 */
export async function clearUnderground(db: Db): Promise<number> {
	await explorers(db).updateMany({ ready: true }, { $set: { ready: false } });
	const result = await explorers(db).updateMany(
		{ underground: { $ne: null } },
		{ $set: { underground: null } }
	);
	return result.modifiedCount;
}

/** Every item (id) these explorers have in their stash or loadout. */
export async function itemsOwned(db: Db, explorerIds: string[]): Promise<Set<string>> {
	const docs = await explorers(db)
		.find({ _id: { $in: explorerIds } }, { projection: { stash: 1, loadout: 1 } })
		.toArray();
	const items = new Set<string>();
	for (const doc of docs) {
		for (const stack of [...(doc.stash ?? []), ...allStacks(doc.loadout ?? emptyInventory())]) {
			if (stack) items.add(stack.item);
		}
	}
	return items;
}
