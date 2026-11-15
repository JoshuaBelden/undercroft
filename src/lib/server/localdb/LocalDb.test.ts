import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Binary } from 'mongodb';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalDb } from './LocalDb.ts';

interface Item {
	_id: string;
	name?: string;
	count?: number;
	tags?: string[];
	nested?: { a?: number; list?: string[] };
	at?: Date;
	email?: string;
}

const items = () => new LocalDb().collection<Item>('items');

describe('reading', () => {
	it('finds by equality, dotted paths and array membership', async () => {
		const c = items();
		await c.insertOne({ _id: 'a', name: 'one', tags: ['x', 'y'], nested: { a: 1 } });
		await c.insertOne({ _id: 'b', name: 'two', tags: ['z'], nested: { a: 2 } });
		expect((await c.findOne({ name: 'two' }))?._id).toBe('b');
		expect((await c.findOne({ 'nested.a': 1 }))?._id).toBe('a');
		expect((await c.findOne({ tags: 'y' }))?._id).toBe('a');
		expect(await c.findOne({ name: 'none' })).toBeNull();
		expect(await c.countDocuments({})).toBe(2);
	});

	it('supports the comparison and set operators', async () => {
		const c = items();
		for (const [i, name] of ['a', 'b', 'c', 'd'].entries()) {
			await c.insertOne({ _id: name, count: i, at: new Date(1000 * i) });
		}
		const ids = async (filter: Record<string, unknown>) =>
			(await c.find(filter).toArray()).map((d) => d._id).sort();
		expect(await ids({ count: { $gt: 1 } })).toEqual(['c', 'd']);
		expect(await ids({ count: { $gte: 1, $lt: 3 } })).toEqual(['b', 'c']);
		expect(await ids({ count: { $lte: 0 } })).toEqual(['a']);
		expect(await ids({ count: { $ne: 2 } })).toEqual(['a', 'b', 'd']);
		expect(await ids({ _id: { $in: ['a', 'd', 'x'] } })).toEqual(['a', 'd']);
		expect(await ids({ _id: { $nin: ['a', 'd'] } })).toEqual(['b', 'c']);
		expect(await ids({ at: { $gt: new Date(1500) } })).toEqual(['c', 'd']);
		expect(await ids({ $or: [{ _id: 'a' }, { count: 3 }] })).toEqual(['a', 'd']);
		expect(await ids({ count: { $eq: 1 } })).toEqual(['b']);
	});

	it('supports $exists, $type, $size and $regex', async () => {
		const c = items();
		await c.insertOne({ _id: 'a', email: 'a@x.com', tags: ['1', '2'] });
		await c.insertOne({ _id: 'b', tags: [] });
		const ids = async (filter: Record<string, unknown>) =>
			(await c.find(filter).toArray()).map((d) => d._id).sort();
		expect(await ids({ email: { $exists: true } })).toEqual(['a']);
		expect(await ids({ email: { $exists: false } })).toEqual(['b']);
		expect(await ids({ email: { $type: 'string' } })).toEqual(['a']);
		expect(await ids({ tags: { $size: 0 } })).toEqual(['b']);
		expect(await ids({ email: { $regex: '^a@' } })).toEqual(['a']);
		expect(await ids({ email: /X\.COM$/i })).toEqual(['a']);
	});

	it('null matches a missing field', async () => {
		const c = items();
		await c.insertOne({ _id: 'a' });
		await c.insertOne({ _id: 'b', name: 'set' });
		expect((await c.find({ name: null as unknown as string }).toArray()).map((d) => d._id)).toEqual(
			['a']
		);
	});

	it('sorts, skips, limits and projects', async () => {
		const c = items();
		await c.insertOne({ _id: 'a', count: 2, name: 'x' });
		await c.insertOne({ _id: 'b', count: 1, name: 'y' });
		await c.insertOne({ _id: 'c', count: 3, name: 'x' });
		const sorted = await c.find({}).sort({ count: -1 }).skip(1).limit(1).toArray();
		expect(sorted.map((d) => d._id)).toEqual(['a']);
		const twoKeys = await c.find({}).sort({ name: 1, count: -1 }).toArray();
		expect(twoKeys.map((d) => d._id)).toEqual(['c', 'a', 'b']);
		const projected = await c.find({ _id: 'a' }, { projection: { name: 1 } }).toArray();
		expect(projected).toEqual([{ _id: 'a', name: 'x' }]);
		const excluded = await c.findOne({ _id: 'a' }, { projection: { name: 0 } });
		expect(excluded).toEqual({ _id: 'a', count: 2 });
	});

	it('never hands out its own documents', async () => {
		const c = items();
		await c.insertOne({ _id: 'a', nested: { a: 1 } });
		const found = await c.findOne({ _id: 'a' });
		found!.nested!.a = 99;
		expect((await c.findOne({ _id: 'a' }))?.nested?.a).toBe(1);
	});

	it('throws on an operator it does not know, rather than guess', async () => {
		const c = items();
		await c.insertOne({ _id: 'a' });
		await expect(
			c.findOne({ name: { $elemMatch: {} } } as Record<string, unknown>)
		).rejects.toThrow(/not supported/);
		expect(() => c.aggregate()).toThrow(/not supported/);
	});
});

describe('writing', () => {
	it('applies $set, $unset, $inc, $max, $addToSet, $push and $pull, with dotted paths', async () => {
		const c = items();
		await c.insertOne({ _id: 'a', count: 1, tags: ['x'], nested: { a: 1, list: ['p', 'q'] } });
		await c.updateOne({ _id: 'a' }, { $set: { name: 'n', 'nested.a': 5 }, $inc: { count: 2 } });
		await c.updateOne({ _id: 'a' }, { $max: { count: 2 } });
		await c.updateOne({ _id: 'a' }, { $addToSet: { tags: 'x' } });
		await c.updateOne({ _id: 'a' }, { $addToSet: { tags: 'y' } });
		await c.updateOne({ _id: 'a' }, { $push: { tags: 'x' } });
		await c.updateOne({ _id: 'a' }, { $pull: { 'nested.list': 'p' } });
		await c.updateOne({ _id: 'a' }, { $unset: { name: '' } });
		expect(await c.findOne({ _id: 'a' })).toEqual({
			_id: 'a',
			count: 3,
			tags: ['x', 'y', 'x'],
			nested: { a: 5, list: ['q'] }
		});
		await c.updateOne({ _id: 'a' }, { $max: { count: 10 } });
		expect((await c.findOne({ _id: 'a' }))?.count).toBe(10);
	});

	it('counts what matched and what actually changed', async () => {
		const c = items();
		await c.insertOne({ _id: 'a', count: 1 });
		await c.insertOne({ _id: 'b', count: 1 });
		const same = await c.updateOne({ _id: 'a' }, { $set: { count: 1 } });
		expect(same).toMatchObject({ matchedCount: 1, modifiedCount: 0 });
		const many = await c.updateMany({ count: 1 }, { $set: { count: 2 } });
		expect(many).toMatchObject({ matchedCount: 2, modifiedCount: 2 });
		const none = await c.updateOne({ _id: 'x' }, { $set: { count: 1 } });
		expect(none).toMatchObject({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
		expect((await c.deleteMany({ count: 2 })).deletedCount).toBe(2);
		expect((await c.deleteOne({ _id: 'a' })).deletedCount).toBe(0);
	});

	it('upserts from the filter, with $setOnInsert only on insert', async () => {
		const c = items();
		const first = await c.updateOne(
			{ _id: 'k', name: 'n' },
			{ $setOnInsert: { tags: ['new'] }, $inc: { count: 1 } },
			{ upsert: true }
		);
		expect(first).toMatchObject({ upsertedCount: 1, upsertedId: 'k' });
		await c.updateOne(
			{ _id: 'k' },
			{ $setOnInsert: { tags: ['again'] }, $inc: { count: 1 } },
			{ upsert: true }
		);
		expect(await c.findOne({ _id: 'k' })).toEqual({ _id: 'k', name: 'n', tags: ['new'], count: 2 });
	});

	it('findOneAndUpdate returns the document before or after', async () => {
		const c = items();
		const after = await c.findOneAndUpdate(
			{ _id: 't' },
			{ $inc: { count: 1 } },
			{ upsert: true, returnDocument: 'after' }
		);
		expect(after?.count).toBe(1);
		const before = await c.findOneAndUpdate(
			{ _id: 't' },
			{ $inc: { count: 1 } },
			{ returnDocument: 'before' }
		);
		expect(before?.count).toBe(1);
		expect(await c.findOneAndUpdate({ _id: 'none' }, { $inc: { count: 1 } })).toBeNull();
	});

	it('replaces a whole document, keeping its id', async () => {
		const c = items();
		await c.replaceOne({ _id: 'r' }, { _id: 'r', name: 'first', count: 1 }, { upsert: true });
		await c.replaceOne({ _id: 'r' }, { name: 'second' } as Item);
		expect(await c.findOne({ _id: 'r' })).toEqual({ _id: 'r', name: 'second' });
	});

	it('gives a document inserted without an id one', async () => {
		const c = new LocalDb().collection<{ _id?: string; n: number }>('x');
		const { insertedId } = await c.insertOne({ n: 1 });
		expect(typeof insertedId).toBe('string');
		expect((await c.findOne({ n: 1 }))?._id).toBe(insertedId);
	});

	it('runs a bulk write', async () => {
		const c = items();
		await c.insertOne({ _id: 'a', count: 1 });
		const result = await c.bulkWrite([
			{ updateOne: { filter: { _id: 'a' }, update: { $inc: { count: -1 } } } },
			{
				updateOne: {
					filter: { _id: 'b' },
					update: { $setOnInsert: { name: 'b' }, $max: { count: 4 } },
					upsert: true
				}
			}
		]);
		expect(result).toMatchObject({ matchedCount: 1, modifiedCount: 1, upsertedCount: 1 });
		expect(await c.findOne({ _id: 'b' })).toEqual({ _id: 'b', name: 'b', count: 4 });
	});
});

describe('indexes', () => {
	it('refuses a duplicate in a unique index, naming the index as MongoDB does', async () => {
		const c = items();
		await c.createIndex({ name: 1 }, { unique: true });
		await c.insertOne({ _id: 'a', name: 'taken' });
		const error = await c.insertOne({ _id: 'b', name: 'taken' }).catch((e: unknown) => e);
		expect(error).toMatchObject({ code: 11000 });
		expect(String((error as Error).message)).toContain('name_1');
		await c.insertOne({ _id: 'c', name: 'free' });
		await expect(c.updateOne({ _id: 'c' }, { $set: { name: 'taken' } })).rejects.toMatchObject({
			code: 11000
		});
		await expect(c.insertOne({ _id: 'a', name: 'other' })).rejects.toMatchObject({ code: 11000 });
	});

	it('a sparse unique index leaves out documents without the field', async () => {
		const c = items();
		await c.createIndex({ 'nested.a': 1 }, { unique: true, sparse: true });
		await c.insertOne({ _id: 'a' });
		await c.insertOne({ _id: 'b' });
		await c.insertOne({ _id: 'c', nested: { a: 1 } });
		await expect(c.insertOne({ _id: 'd', nested: { a: 1 } })).rejects.toMatchObject({
			code: 11000
		});
	});

	it('a partial unique index only covers what its filter matches', async () => {
		const c = items();
		await c.createIndex(
			{ email: 1 },
			{ unique: true, partialFilterExpression: { email: { $type: 'string' } } }
		);
		await c.insertOne({ _id: 'a' });
		await c.insertOne({ _id: 'b' });
		await c.insertOne({ _id: 'c', email: 'x@y.z' });
		await expect(c.insertOne({ _id: 'd', email: 'x@y.z' })).rejects.toMatchObject({ code: 11000 });
	});

	it('the same index again is fine; different options conflict (code 85)', async () => {
		const c = items();
		await c.createIndex({ email: 1 }, { unique: true });
		await c.createIndex({ email: 1 }, { unique: true });
		await expect(c.createIndex({ email: 1 }, { unique: true, sparse: true })).rejects.toMatchObject(
			{ code: 85 }
		);
		await c.dropIndex('email_1');
		await c.createIndex({ email: 1 }, { unique: true, sparse: true });
	});

	it('a TTL index hides documents whose time has passed, then removes them', async () => {
		let now = 10_000;
		const db = new LocalDb({ now: () => now });
		const c = db.collection<{ _id: string; expires: Date }>('sessions');
		await c.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
		await c.insertOne({ _id: 's', expires: new Date(20_000) });
		expect(await c.findOne({ _id: 's' })).not.toBeNull();
		now = 20_000;
		expect(await c.findOne({ _id: 's' })).toBeNull();
		expect(await c.countDocuments({})).toBe(0);
		expect(c.purgeExpired()).toBe(1);
	});
});

describe('the save file', () => {
	let dir = '';
	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = '';
	});

	it('keeps documents, dates and binaries across a restart', async () => {
		dir = mkdtempSync(path.join(tmpdir(), 'localdb-'));
		const file = path.join(dir, 'save', 'undercroft.json');
		const first = new LocalDb({ file });
		const picture = new Binary(Buffer.from([1, 2, 3]));
		await first
			.collection('things')
			.insertOne({ _id: 'a', at: new Date(5000), image: picture, list: [1] });
		first.close();
		const second = new LocalDb({ file });
		const doc = await second
			.collection<{ _id: string; at: Date; image: Binary }>('things')
			.findOne({ _id: 'a' });
		expect(doc?.at).toEqual(new Date(5000));
		expect(Buffer.from(doc!.image.buffer)).toEqual(Buffer.from([1, 2, 3]));
		second.close();
	});

	it('falls back to the previous save when the newest is broken, keeping the broken one', async () => {
		dir = mkdtempSync(path.join(tmpdir(), 'localdb-'));
		const file = path.join(dir, 'undercroft.json');
		const db = new LocalDb({ file });
		await db.collection('things').insertOne({ _id: 'old' });
		db.save();
		await db.collection('things').insertOne({ _id: 'new' });
		db.close();
		expect(existsSync(`${file}.bak`)).toBe(true);
		writeFileSync(file, '{ not json');
		const reopened = new LocalDb({ file });
		expect(await reopened.collection('things').findOne({ _id: 'old' })).not.toBeNull();
		expect(readdirSync(dir).some((name) => name.includes('.broken-'))).toBe(true);
		reopened.close();
		expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
	});

	it('pings like MongoDB, and refuses other commands', async () => {
		const db = new LocalDb();
		expect(await db.command({ ping: 1 })).toEqual({ ok: 1 });
		await expect(db.command({ dropDatabase: 1 })).rejects.toThrow(/not supported/);
	});
});
