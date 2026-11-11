import type { Db } from 'mongodb';
import { SHOP, sellPrice } from '../../content/economy.ts';
import { ITEMS, SLOTS } from '../../content/items.ts';
import {
	addToSlots,
	emptyInventory,
	emptySlots,
	newStack,
	sanitizeRef,
	takeStack
} from '../../shared/items/inventory.ts';
import type { ExplorerDoc } from './accounts.ts';
import { changeExplorer, type ExplorerError } from './explorers.ts';

/**
 * The shop, and the ledger every change of money or belongings is written to. Prices come from
 * `src/lib/content/economy.ts`; the client never names a price. See docs/dev/economy.md.
 */

/** One line of the economy log. */
export interface LedgerDoc {
	explorer: string;
	at: Date;
	/** What happened: a purchase, a sale, something thrown away, an admin grant or reset. */
	kind: 'buy' | 'sell' | 'discard' | 'grant' | 'reset';
	item?: string;
	count?: number;
	/** Money gained (negative: spent). */
	money: number;
	/** Money afterwards. */
	balance: number;
}

type Result = Promise<{ explorer: ExplorerDoc } | { error: ExplorerError }>;

export async function log(db: Db, entry: Omit<LedgerDoc, 'at'>): Promise<void> {
	await db.collection<LedgerDoc>('ledger').insertOne({ ...entry, at: new Date() });
}

/** Put `count` of an item in the stash (firearms empty). False, with nothing added, if they don't all fit. */
function stock(explorer: ExplorerDoc, item: string, count: number): boolean {
	const stash = explorer.stash.map((stack) => (stack ? { ...stack } : null));
	if (addToSlots(stash, newStack(item, count)) > 0) return false;
	explorer.stash = stash;
	return true;
}

/** Buy `lots` lots of a shop item into the stash. */
export async function buy(db: Db, explorerId: string, item: unknown, lots: unknown): Result {
	const entry = SHOP.find((e) => e.item === item);
	const wanted = typeof lots === 'number' && Number.isInteger(lots) ? lots : 1;
	if (!entry || !ITEMS[entry.item] || wanted < 1 || wanted > 99) return { error: 'unsold' };
	const cost = entry.price * wanted;
	const result = await changeExplorer(db, explorerId, (explorer) => {
		if (explorer.money < cost) return 'money';
		explorer.money -= cost;
		return stock(explorer, entry.item, entry.lot * wanted) ? null : 'stashFull';
	});
	if ('explorer' in result) {
		await log(db, {
			explorer: explorerId,
			kind: 'buy',
			item: entry.item,
			count: entry.lot * wanted,
			money: -cost,
			balance: result.explorer.money
		});
	}
	return result;
}

/** Sell up to `count` from a slot (`from`: a SlotRef in the stash or the loadout). */
export async function sell(db: Db, explorerId: string, from: unknown, count: unknown): Result {
	const at = sanitizeRef(from, true);
	const wanted = typeof count === 'number' && Number.isFinite(count) ? Math.floor(count) : 1;
	let sold = { item: '', count: 0, money: 0 };
	const result = await changeExplorer(db, explorerId, (explorer) => {
		if (!at || wanted < 1) return 'missing';
		const stack = takeStack({ inventory: explorer.loadout, stash: explorer.stash }, at, wanted);
		if (!stack) return 'missing';
		const each = sellPrice(stack.item);
		if (each <= 0) return 'worthless';
		explorer.money += each * stack.count;
		sold = { item: stack.item, count: stack.count, money: each * stack.count };
		return null;
	});
	if ('explorer' in result) {
		await log(db, { explorer: explorerId, kind: 'sell', ...sold, balance: result.explorer.money });
	}
	return result;
}

/** Admin: give money, or an item into the stash. */
export async function grant(
	db: Db,
	explorerId: string,
	what: { money?: unknown; item?: unknown; count?: unknown }
): Result {
	const amount = typeof what.money === 'number' && Number.isFinite(what.money) ? what.money : 0;
	const item = typeof what.item === 'string' && ITEMS[what.item] ? what.item : null;
	const count =
		typeof what.count === 'number' && Number.isFinite(what.count)
			? Math.max(1, Math.min(99, Math.floor(what.count)))
			: 1;
	if (amount === 0 && !item) return { error: 'missing' };
	const result = await changeExplorer(db, explorerId, (explorer) => {
		explorer.money = Math.max(0, Math.round(explorer.money + amount));
		return !item || stock(explorer, item, count) ? null : 'stashFull';
	});
	if ('explorer' in result) {
		await log(db, {
			explorer: explorerId,
			kind: 'grant',
			...(item ? { item, count } : {}),
			money: amount,
			balance: result.explorer.money
		});
	}
	return result;
}

/** Admin: back to a new explorer: no money, nothing owned, nothing learned. */
export async function resetExplorer(db: Db, explorerId: string): Result {
	const result = await changeExplorer(db, explorerId, (explorer) => {
		explorer.money = 0;
		explorer.stash = emptySlots(SLOTS.stash);
		explorer.loadout = emptyInventory();
		return null;
	});
	if ('explorer' in result) {
		await db.collection('progress').deleteMany({ player: explorerId });
		await log(db, { explorer: explorerId, kind: 'reset', money: 0, balance: 0 });
	}
	return result;
}
