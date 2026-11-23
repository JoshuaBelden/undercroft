import { beforeEach, describe, expect, it } from 'vitest';
import { ECONOMY } from '../../content/economy.ts';
import type { Db } from 'mongodb';
import { ITEMS } from '../../content/items.ts';
import { LocalDb } from '../localdb/LocalDb.ts';
import { newStack } from '../../shared/items/inventory.ts';
import {
	accountView,
	createAccount,
	ensureIndexes,
	explorerFor,
	type ExplorerDoc
} from './accounts.ts';
import { discover, discoverAll, resetDiscoveries, seen, setTrust } from './discoveries.ts';
import { buy, sell } from './shop.ts';
import { craft, repair, salvage } from './workshop.ts';

/** The Workshop, discoveries and the store's tiers, on LocalDb (docs/dev/crafting.md). */

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
});

const doc = async () =>
	(await db.collection<ExplorerDoc>('explorers').findOne({ _id: explorer._id }))!;

async function stash(...stacks: ReturnType<typeof newStack>[]): Promise<void> {
	const slots = [...stacks, ...new Array(30 - stacks.length).fill(null)];
	await db
		.collection<ExplorerDoc>('explorers')
		.updateOne({ _id: explorer._id }, { $set: { stash: slots } });
}

describe('discoveries', () => {
	it('are kept with where they were seen; new ones are fresh until looked at', async () => {
		await discover(db, explorer._id, [
			{ item: 'rags', source: 'crate' },
			{ item: 'rags', source: 'locker' },
			{ item: 'brick', source: 'crate' }
		]);
		let now = await doc();
		expect(now.discovered).toEqual({ rags: ['crate', 'locker'] });
		expect(now.fresh).toEqual(['rags']);
		await discover(db, explorer._id, [{ item: 'rags', source: 'corpse' }]);
		now = await doc();
		expect(now.discovered?.rags).toEqual(['crate', 'locker', 'corpse']);
		expect(now.fresh).toEqual(['rags']);
		await seen(db, explorer._id, ['rags']);
		expect((await doc()).fresh).toEqual([]);
	});

	it('an item id with a dot in it is kept whole', async () => {
		await discover(db, explorer._id, [{ item: 'ammo.revolver', source: 'corpse' }]);
		const account = (await db.collection('accounts').findOne({}))!;
		const view = await accountView(db, account as never);
		expect(view.explorer.discovered).toEqual({ 'ammo.revolver': ['corpse'] });
		expect(view.explorer.fresh).toEqual(['ammo.revolver']);
	});

	it('the admin can discover everything, or forget it all', async () => {
		await discoverAll(db, explorer._id);
		expect(Object.keys((await doc()).discovered ?? {})).toContain('gun-parts');
		await resetDiscoveries(db, explorer._id);
		expect((await doc()).discovered).toEqual({});
	});
});

describe('the Workshop', () => {
	it('crafts an available recipe from the stash, marked crafted', async () => {
		await stash(newStack('rags', 5));
		expect(await craft(db, explorer._id, 'bandage', 1)).toEqual({ error: 'undiscovered' });
		await discover(db, explorer._id, [{ item: 'rags', source: 'crate' }]);
		const result = await craft(db, explorer._id, 'bandage', 2);
		expect('explorer' in result).toBe(true);
		const now = await doc();
		const made = now.stash.find((s) => s?.item === 'bandage');
		expect(made).toEqual({ item: 'bandage', count: 2, crafted: true });
		expect(now.stash.find((s) => s?.item === 'rags')?.count).toBe(1);
		expect(await craft(db, explorer._id, 'bandage', 1)).toEqual({ error: 'materials' });
	});

	it('takes materials carried back up (backpack, quick slots) after the stash', async () => {
		await discover(db, explorer._id, [{ item: 'rags', source: 'crate' }]);
		await stash(newStack('rags', 1));
		const backpack = [
			newStack('rags', 3),
			...new Array(explorer.loadout.backpack.length - 1).fill(null)
		];
		await db
			.collection<ExplorerDoc>('explorers')
			.updateOne({ _id: explorer._id }, { $set: { 'loadout.backpack': backpack } });
		expect('explorer' in (await craft(db, explorer._id, 'bandage', 2))).toBe(true);
		const now = await doc();
		expect(now.stash.some((s) => s?.item === 'rags')).toBe(false);
		expect(now.loadout.backpack[0]).toBeNull();
		expect(now.stash.find((s) => s?.item === 'bandage')?.count).toBe(2);
		expect(await craft(db, explorer._id, 'bandage', 1)).toEqual({ error: 'materials' });
	});

	it('mends a worn thing for its materials and coin', async () => {
		const crowbar = { ...newStack('crowbar'), worn: ITEMS.crowbar.durability!.max };
		await stash(crowbar, newStack('metal', 1));
		await db
			.collection<ExplorerDoc>('explorers')
			.updateOne({ _id: explorer._id }, { $set: { money: 100 } });
		const result = await repair(db, explorer._id, { area: 'stash', index: 0 });
		expect('explorer' in result).toBe(true);
		const now = await doc();
		expect(now.stash[0]?.worn).toBeUndefined();
		expect(now.stash.some((s) => s?.item === 'metal')).toBe(false);
		expect(now.money).toBe(100 - Math.ceil(ITEMS.crowbar.price! * 0.2));
		expect(await repair(db, explorer._id, { area: 'stash', index: 0 })).toEqual({
			error: 'unrepairable'
		});
	});

	it('salvages a thing into its materials; treasure never', async () => {
		await stash(newStack('crowbar'), newStack('coins', 3));
		expect('explorer' in (await salvage(db, explorer._id, { area: 'stash', index: 0 }))).toBe(true);
		const now = await doc();
		expect(now.stash.some((s) => s?.item === 'crowbar')).toBe(false);
		expect(now.stash.find((s) => s?.item === 'metal')?.count).toBe(2);
		const coins = now.stash.findIndex((s) => s?.item === 'coins');
		expect(await salvage(db, explorer._id, { area: 'stash', index: coins })).toEqual({
			error: 'unsalvageable'
		});
	});
});

describe('the store’s tiers', () => {
	it('selling builds trust; trust opens tiers; only open tiers sell', async () => {
		await db
			.collection<ExplorerDoc>('explorers')
			.updateOne({ _id: explorer._id }, { $set: { money: 1000 } });
		expect(await buy(db, explorer._id, 'shotgun', 1)).toEqual({ error: 'unsold' });
		await stash(newStack('relic'));
		await sell(db, explorer._id, { area: 'stash', index: 0 }, 1);
		expect((await doc()).sold).toBe(ITEMS.relic.value);
		await setTrust(db, explorer._id, 1000);
		expect('explorer' in (await buy(db, explorer._id, 'shotgun', 1))).toBe(true);
		const account = (await db.collection('accounts').findOne({}))!;
		const view = await accountView(db, account as never);
		expect(view.explorer.tiers).toContain('trusted');
	});
});

describe('starting again (the admin reset)', () => {
	it('takes everything owned and learned back to how a new player starts; the account stays', async () => {
		await stash(newStack('crowbar'), newStack('rags', 3));
		await db
			.collection<ExplorerDoc>('explorers')
			.updateOne({ _id: explorer._id }, { $set: { money: 500 } });
		await discover(db, explorer._id, [{ item: 'rags', source: 'crate' }]);
		await setTrust(db, explorer._id, 2000);
		await db.collection('progress').insertOne({
			_id: `${explorer._id}:rumors` as never,
			player: explorer._id,
			affliction: 'rumors',
			resolved: true
		});
		const { resetExplorer } = await import('./shop.ts');
		expect('explorer' in (await resetExplorer(db, explorer._id))).toBe(true);
		const now = await doc();
		expect(now.money).toBe(ECONOMY.startingMoney);
		expect(now.stash.every((s) => s === null)).toBe(true);
		expect(now.discovered).toEqual({});
		expect(now.fresh).toEqual([]);
		expect(now.sold).toBe(0);
		expect(await db.collection('progress').countDocuments({ player: explorer._id })).toBe(0);
		expect(await db.collection('accounts').countDocuments({})).toBe(1);
	});
});
