import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { LocalDb } from '../localdb/LocalDb.ts';
import { ECONOMY, sellPrice } from '../../content/economy.ts';
import { salvageOf } from '../../shared/items/crafting.ts';
import {
	addItem,
	allStacks,
	applyAction,
	emptyInventory,
	newStack
} from '../../shared/items/inventory.ts';
import type { Look } from '../../shared/player/look.ts';
import { createAccount, ensureIndexes, explorerFor, type ExplorerDoc } from './accounts.ts';
import {
	changeExplorer,
	clearUnderground,
	itemsOwned,
	looksOf,
	markReady,
	resetLook,
	returnFromExpedition,
	setLook,
	takeLoadout,
	useFreeLoadout
} from './explorers.ts';

/** The stash and loadout store on LocalDb: descending, coming back, and the hub's locks. */

let db: Db;
let explorer: ExplorerDoc;

beforeEach(async () => {
	db = new LocalDb().asDb();
	await ensureIndexes(db);
	const result = await createAccount(db, {
		email: 'e@x.co',
		password: 'longenough1',
		gamerTag: 'Explorer'
	});
	if ('error' in result) throw new Error(result.error);
	explorer = await explorerFor(db, result.account._id);
	// Something to take down: a knife in the loadout.
	await changeExplorer(db, explorer._id, (doc) => {
		addItem(doc.loadout, newStack('knife', 1, 99));
		return null;
	});
});

const read = async (): Promise<ExplorerDoc> => explorerFor(db, explorer.account);

describe('a new explorer', () => {
	it('starts with the starting coin', () => {
		expect(explorer.money).toBe(ECONOMY.startingMoney);
		expect(ECONOMY.startingMoney).toBe(100);
	});
});

describe('the free loadout', () => {
	const empty = async (): Promise<void> => {
		await changeExplorer(db, explorer._id, (doc) => {
			doc.loadout = emptyInventory();
			return null;
		});
	};

	it('is a crowbar, a padded coat and 3 bandages, all free, for an empty loadout', async () => {
		await empty();
		const kit = await takeLoadout(db, explorer._id, 's', true);
		expect(kit.equipment.primary).toEqual({ ...newStack('crowbar'), free: true });
		expect(kit.equipment.defense).toEqual({ ...newStack('coat'), free: true });
		expect(kit.quick[0]).toEqual({ ...newStack('bandage', 3), free: true });
		expect(allStacks(kit)).toHaveLength(3);
		expect((await read()).underground).toBe('s');
	});

	it('is not given over a loadout of their own: that goes down instead', async () => {
		const kit = await takeLoadout(db, explorer._id, 's', true);
		expect(allStacks(kit).map((stack) => stack.item)).toEqual(['knife']);
	});

	it('is barely coin: it sells for a token, salvages to nothing, and keeps apart', async () => {
		await empty();
		const kit = await takeLoadout(db, explorer._id, 's', true);
		const coat = kit.equipment.defense!;
		expect(sellPrice(coat.item, coat)).toBe(ECONOMY.freeSell);
		expect(ECONOMY.freeSell).toBe(1);
		expect(sellPrice('coat', newStack('coat'))).toBeGreaterThan(0);
		expect(salvageOf(coat)).toEqual([]);
		// Free bandages and bought ones don't merge.
		kit.quick[1] = newStack('bandage', 2);
		applyAction(
			{ inventory: kit },
			{ kind: 'move', from: { area: 'quick', index: 1 }, to: { area: 'quick', index: 0 } }
		);
		const bandages = allStacks(kit).filter((stack) => stack.item === 'bandage');
		expect(bandages.map((stack) => [stack.count, !!stack.free]).sort()).toEqual([
			[2, false],
			[3, true]
		]);
	});

	it('used, puts the loadout in the stash and the free loadout in its place', async () => {
		expect('explorer' in (await useFreeLoadout(db, explorer._id))).toBe(true);
		const now = await read();
		expect(now.stash.filter((s) => s?.item === 'knife')).toHaveLength(1);
		expect(allStacks(now.loadout).map((s) => [s.item, !!s.free])).toEqual([
			['crowbar', true],
			['coat', true],
			['bandage', true]
		]);
		// Used again: the free kit is given back, not stashed, so it never piles up.
		await useFreeLoadout(db, explorer._id);
		const again = await read();
		expect(again.stash.filter((s) => s?.free)).toEqual([]);
		expect(allStacks(again.loadout)).toHaveLength(3);
		// And what goes down is that kit.
		const kit = await takeLoadout(db, explorer._id, 's', true);
		expect(allStacks(kit).every((s) => s.free)).toBe(true);
	});

	it('used with a stash too full for the loadout, changes nothing', async () => {
		await changeExplorer(db, explorer._id, (doc) => {
			doc.stash = doc.stash.map(() => newStack('rags', 1));
			return null;
		});
		expect(await useFreeLoadout(db, explorer._id)).toEqual({ error: 'backpackFirst' });
		const now = await read();
		expect(allStacks(now.loadout).map((s) => s.item)).toEqual(['knife']);
	});
});

describe('an expedition', () => {
	it('takes the loadout down and marks them underground, once', async () => {
		const kit = await takeLoadout(db, explorer._id, 'session-1');
		expect(allStacks(kit).map((stack) => stack.item)).toEqual(['knife']);
		const after = await read();
		expect(after.underground).toBe('session-1');
		expect(after.loadout).toEqual(emptyInventory());
		// Already underground: nothing more comes out (no copies).
		expect(await takeLoadout(db, explorer._id, 'session-2')).toEqual(emptyInventory());
	});

	it('brings back what was carried out, or nothing when it was lost', async () => {
		const kit = await takeLoadout(db, explorer._id, 's');
		await returnFromExpedition(db, explorer._id, 's', kit);
		const back = await read();
		expect(back.underground).toBeNull();
		expect(back.loadout).toEqual({ ...kit, selected: 0 });

		await takeLoadout(db, explorer._id, 't');
		await returnFromExpedition(db, explorer._id, 't', null);
		expect((await read()).loadout).toEqual(emptyInventory());
	});

	it('ignores a return for some other expedition', async () => {
		await takeLoadout(db, explorer._id, 's');
		await returnFromExpedition(db, explorer._id, 'other', emptyInventory());
		expect((await read()).underground).toBe('s');
	});

	it('knows what each explorer owns (for the rite items)', async () => {
		expect([...(await itemsOwned(db, [explorer._id]))]).toEqual(['knife']);
	});
});

describe('the hub', () => {
	it("can't change an explorer who is ready or underground", async () => {
		await markReady(db, explorer._id, true);
		expect(await changeExplorer(db, explorer._id, () => null)).toEqual({ error: 'ready' });
		await markReady(db, explorer._id, false);
		await takeLoadout(db, explorer._id, 's');
		expect(await changeExplorer(db, explorer._id, () => null)).toEqual({ error: 'underground' });
	});

	it('a fresh start of the game server unlocks everyone', async () => {
		await markReady(db, explorer._id, true);
		await takeLoadout(db, explorer._id, 's');
		expect(await clearUnderground(db)).toBe(1);
		const after = await read();
		expect(after.underground).toBeNull();
		expect(after.ready).toBe(false);
	});

	it('refuses a change when something else changed the explorer first', async () => {
		const result = await changeExplorer(db, explorer._id, (doc) => {
			doc.money = 5;
			return null;
		});
		expect('explorer' in result).toBe(true);
		// Another write lands between the read and the write: the second change is refused.
		let raced = false;
		const second = await changeExplorer(db, explorer._id, (doc) => {
			if (!raced) {
				raced = true;
				void db
					.collection<ExplorerDoc>('explorers')
					.updateOne({ _id: explorer._id }, { $set: { money: 9 } });
			}
			doc.money = 7;
			return null;
		});
		expect(second).toEqual({ error: 'busy' });
		expect((await read()).money).toBe(9);
	});
});

describe('looks', () => {
	const look: Look = {
		body: 'female',
		face: 1,
		wear: { hair: 'hair-bob', shirt: 'shirt', pants: 'pants-cargo' },
		tints: { skin: 'tan' }
	};

	it('saves a look, even underground, and reads it back', async () => {
		await takeLoadout(db, explorer._id, 'run-1');
		expect('error' in (await setLook(db, explorer._id, look))).toBe(false);
		expect((await looksOf(db, [explorer._id])).get(explorer._id)).toEqual(look);
	});

	it('leaves out explorers who never chose one, and forgets a reset one', async () => {
		expect((await looksOf(db, [explorer._id])).size).toBe(0);
		await setLook(db, explorer._id, look);
		await resetLook(db, explorer._id);
		expect((await looksOf(db, [explorer._id])).size).toBe(0);
	});

	it('refuses an explorer that does not exist', async () => {
		expect(await setLook(db, 'nobody', look)).toEqual({ error: 'missing' });
	});
});
