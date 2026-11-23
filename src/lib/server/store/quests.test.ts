import type { Db } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';
import { newStack } from '../../shared/items/inventory.ts';
import { LocalDb } from '../localdb/LocalDb.ts';
import {
	accountView,
	createAccount,
	ensureIndexes,
	explorerFor,
	getAccount,
	type ExplorerDoc
} from './accounts.ts';
import { advanceQuests, buyFromNpc, commitQuest, reportQuest, setQuests } from './quests.ts';

/** Quests on the surface, on LocalDb (docs/dev/quests.md). */

let db: Db;
let explorer: ExplorerDoc;

beforeEach(async () => {
	db = new LocalDb().asDb();
	await ensureIndexes(db);
	const result = await createAccount(db, {
		email: 'q@x.co',
		password: 'longenough1',
		gamerTag: 'Quester'
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

const resolve = (affliction: string) =>
	db
		.collection<{ _id: string; player: string; affliction: string; resolved: boolean }>('progress')
		.insertOne({
			_id: `${explorer._id}:${affliction}`,
			player: explorer._id,
			affliction,
			resolved: true
		});

const STASH = (index: number) => ({ area: 'stash' as const, index });

describe('quests on the surface', () => {
	it('the first is reported for its flask and coin once Rumors is got out of', async () => {
		expect(await reportQuest(db, explorer._id, 'fontaine')).toEqual({ error: 'notReady' });
		await advanceQuests(db, explorer._id, [{ kind: 'extract', affliction: 'rumors' }]);
		const before = (await doc()).money;
		const result = await reportQuest(db, explorer._id, 'fontaine');
		expect('explorer' in result).toBe(true);
		const after = await doc();
		expect(after.money).toBe(before + 50);
		expect(after.stash.some((s) => s?.item === 'powder-flask')).toBe(true);
		expect(after.quests?.quests.fontaine.done).toBeDefined();
		expect(after.progression?.firsts).toContain('quest:fontaine');
		// Done is done.
		expect(await reportQuest(db, explorer._id, 'fontaine')).toEqual({ error: 'notReady' });
	});

	it('an explorer from before quests starts with the first met, if they have been through Rumors', async () => {
		await resolve('rumors');
		const account = (await getAccount(db, explorer.account))!;
		const view = await accountView(db, account);
		expect(view.explorer.quests.quests.fontaine.counts).toEqual([1]);
		expect('explorer' in (await reportQuest(db, explorer._id, 'fontaine'))).toBe(true);
	});

	it('commits only what is wanted, uses it up, and never what was lent', async () => {
		await setQuests(db, explorer._id, {
			quests: { fontaine: { counts: [1], committed: {}, done: 1 } },
			flags: []
		});
		await stash(newStack('candle', 3), newStack('rosary', 1), {
			...newStack('candle', 2),
			free: true
		});
		expect(await commitQuest(db, explorer._id, 'by-candle', STASH(1))).toEqual({
			error: 'unwanted'
		});
		expect(await commitQuest(db, explorer._id, 'by-candle', STASH(2))).toEqual({ error: 'lent' });
		expect('explorer' in (await commitQuest(db, explorer._id, 'by-candle', STASH(0)))).toBe(true);
		const after = await doc();
		expect(after.stash[0]).toBeNull();
		expect(after.quests?.quests['by-candle'].committed).toEqual({ candle: 3 });
		// Not ready: two candles and the crafting still wanted.
		expect(await reportQuest(db, explorer._id, 'by-candle')).toEqual({ error: 'notReady' });
	});

	it("won't commit to a locked quest, or while underground", async () => {
		await stash(newStack('rosary', 1));
		expect(await commitQuest(db, explorer._id, 'moved-dead', STASH(0))).toEqual({
			error: 'unwanted'
		});
		await setQuests(db, explorer._id, {
			quests: { fontaine: { counts: [1], committed: {}, done: 1 } },
			flags: []
		});
		await db
			.collection<ExplorerDoc>('explorers')
			.updateOne({ _id: explorer._id }, { $set: { underground: 'run' } });
		expect(await commitQuest(db, explorer._id, 'moved-dead', STASH(0))).toEqual({
			error: 'underground'
		});
	});

	it('Fontaine sells powder only once she has asked for the stair to be blown', async () => {
		await db
			.collection<ExplorerDoc>('explorers')
			.updateOne({ _id: explorer._id }, { $set: { money: 500 } });
		expect(await buyFromNpc(db, explorer._id, 'fontaine', 'powder-flask')).toEqual({
			error: 'unsold'
		});
		await setQuests(db, explorer._id, {
			quests: { fontaine: { counts: [1], committed: {}, done: 1 } },
			flags: []
		});
		expect('explorer' in (await buyFromNpc(db, explorer._id, 'fontaine', 'powder-flask'))).toBe(
			true
		);
		expect((await doc()).money).toBe(380);
	});
});
