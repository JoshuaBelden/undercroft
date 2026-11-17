import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { LocalDb } from '../localdb/LocalDb.ts';
import { addItem, allStacks, emptyInventory, newStack } from '../../shared/items/inventory.ts';
import { createAccount, ensureIndexes, explorerFor, type ExplorerDoc } from './accounts.ts';
import {
	changeExplorer,
	clearUnderground,
	itemsOwned,
	markReady,
	returnFromExpedition,
	takeLoadout
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
