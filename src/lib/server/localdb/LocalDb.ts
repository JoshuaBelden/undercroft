import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from 'mongodb';
import { matches, project, sorter } from './query.ts';
import { applyUpdate, seedFromFilter } from './update.ts';
import { clone, equal, fromJson, getPath, newId, toJson, type Doc } from './values.ts';

/**
 * LocalDb: a small MongoDB-compatible document store, kept in memory and saved to one JSON file.
 * The desktop app's save (docs/dev/hosting.md#localdb): the same store code (src/lib/server/store)
 * and game server run on it as on MongoDB. It implements exactly what that code uses; anything
 * else throws. Also what the store's unit tests run on.
 */

type Filter = Doc;
type Update = Doc;
type SortSpec = Record<string, 1 | -1>;
type Projection = Record<string, 0 | 1 | boolean>;

interface IndexOptions {
	unique?: boolean;
	sparse?: boolean;
	partialFilterExpression?: Doc;
	expireAfterSeconds?: number;
	name?: string;
}

interface Index {
	name: string;
	keys: [string, 1 | -1][];
	options: IndexOptions;
}

export interface UpdateResult {
	acknowledged: true;
	matchedCount: number;
	modifiedCount: number;
	upsertedCount: number;
	upsertedId: unknown;
}

interface FindOptions {
	projection?: Projection;
	sort?: SortSpec;
	limit?: number;
	skip?: number;
}

/** What `find` returns: chain `sort`, `skip`, `limit`, `project`, then `toArray` (or iterate). */
export class LocalCursor<T> {
	private sortSpec: SortSpec | undefined;
	private skipCount = 0;
	private limitCount = 0;
	private projection: Projection | undefined;

	constructor(
		private readonly run: () => Doc[],
		options: FindOptions = {}
	) {
		this.sortSpec = options.sort;
		this.skipCount = options.skip ?? 0;
		this.limitCount = options.limit ?? 0;
		this.projection = options.projection;
	}

	sort(spec: SortSpec): this {
		this.sortSpec = spec;
		return this;
	}

	skip(count: number): this {
		this.skipCount = count;
		return this;
	}

	limit(count: number): this {
		this.limitCount = count;
		return this;
	}

	project(projection: Projection): this {
		this.projection = projection;
		return this;
	}

	async toArray(): Promise<T[]> {
		let docs = this.run();
		if (this.sortSpec) docs = [...docs].sort(sorter(this.sortSpec));
		if (this.skipCount) docs = docs.slice(this.skipCount);
		if (this.limitCount) docs = docs.slice(0, this.limitCount);
		return docs.map((doc) => clone(project(doc, this.projection)) as T);
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<T> {
		for (const doc of await this.toArray()) yield doc;
	}
}

const duplicateKey = (collection: string, index: Index, doc: Doc): Error => {
	const keys = index.keys.map(([key]) => `${key}: ${JSON.stringify(getPath(doc, key) ?? null)}`);
	return Object.assign(
		new Error(
			`E11000 duplicate key error collection: local.${collection} index: ${index.name} dup key: { ${keys.join(', ')} }`
		),
		{ code: 11000 }
	);
};

export class LocalCollection<T = Doc> {
	private docs = new Map<string, Doc>();
	private indexes: Index[] = [];

	constructor(
		readonly collectionName: string,
		private readonly db: LocalDb
	) {}

	// --- Indexes ----------------------------------------------------------------------------

	async createIndex(spec: Record<string, 1 | -1>, options: IndexOptions = {}): Promise<string> {
		const keys = Object.entries(spec) as [string, 1 | -1][];
		const name = options.name ?? keys.map(([key, dir]) => `${key}_${dir}`).join('_');
		const existing = this.indexes.find((index) => index.name === name);
		if (existing) {
			const same =
				Boolean(existing.options.unique) === Boolean(options.unique) &&
				Boolean(existing.options.sparse) === Boolean(options.sparse) &&
				existing.options.expireAfterSeconds === options.expireAfterSeconds &&
				equal(existing.options.partialFilterExpression, options.partialFilterExpression);
			if (same) return name;
			throw Object.assign(
				new Error(`Index with name: ${name} already exists with different options`),
				{
					code: 85
				}
			);
		}
		const index: Index = { name, keys, options };
		if (options.unique) {
			const seen: Doc[] = [];
			for (const doc of this.live()) {
				if (!this.indexed(index, doc)) continue;
				if (seen.some((other) => this.sameKey(index, doc, other))) {
					throw duplicateKey(this.collectionName, index, doc);
				}
				seen.push(doc);
			}
		}
		this.indexes.push(index);
		return name;
	}

	async dropIndex(name: string): Promise<void> {
		const before = this.indexes.length;
		this.indexes = this.indexes.filter((index) => index.name !== name);
		if (this.indexes.length === before) throw new Error(`index not found with name [${name}]`);
	}

	/** Whether a document is in a (unique) index: sparse and partial indexes leave some out. */
	private indexed(index: Index, doc: Doc): boolean {
		if (
			index.options.partialFilterExpression &&
			!matches(doc, index.options.partialFilterExpression)
		) {
			return false;
		}
		if (index.options.sparse && index.keys.every(([key]) => getPath(doc, key) === undefined)) {
			return false;
		}
		return true;
	}

	private sameKey(index: Index, a: Doc, b: Doc): boolean {
		return index.keys.every(([key]) => equal(getPath(a, key) ?? null, getPath(b, key) ?? null));
	}

	/** Refuse a write that would give two documents the same key in a unique index. */
	private checkUnique(doc: Doc, replacing?: string): void {
		for (const index of this.indexes) {
			if (!index.options.unique || !this.indexed(index, doc)) continue;
			for (const [id, other] of this.docs) {
				if (id === replacing || id === idKey(doc._id) || this.expired(other)) continue;
				if (this.indexed(index, other) && this.sameKey(index, doc, other)) {
					throw duplicateKey(this.collectionName, index, doc);
				}
			}
		}
	}

	/** A TTL index's time has passed for this document: it is as good as deleted. */
	private expired(doc: Doc): boolean {
		for (const index of this.indexes) {
			const seconds = index.options.expireAfterSeconds;
			if (seconds === undefined) continue;
			const at = getPath(doc, index.keys[0][0]);
			if (at instanceof Date && at.getTime() + seconds * 1000 <= this.db.now()) return true;
		}
		return false;
	}

	/** Remove what TTL indexes say has expired (MongoDB does this about once a minute). */
	purgeExpired(): number {
		let removed = 0;
		for (const [id, doc] of this.docs) {
			if (this.expired(doc)) {
				this.docs.delete(id);
				removed++;
			}
		}
		if (removed) this.db.changed();
		return removed;
	}

	private live(): Doc[] {
		return [...this.docs.values()].filter((doc) => !this.expired(doc));
	}

	private matching(filter: Filter): Doc[] {
		// A plain `_id` lookup doesn't need to look at everything.
		if (
			filter &&
			Object.keys(filter).length === 1 &&
			filter._id !== undefined &&
			typeof filter._id !== 'object'
		) {
			const doc = this.docs.get(idKey(filter._id));
			return doc && !this.expired(doc) ? [doc] : [];
		}
		return this.live().filter((doc) => matches(doc, filter ?? {}));
	}

	// --- Reading ----------------------------------------------------------------------------

	async findOne(
		filter: Filter = {},
		options: { projection?: Projection; sort?: SortSpec } = {}
	): Promise<T | null> {
		let docs = this.matching(filter);
		if (options.sort) docs = [...docs].sort(sorter(options.sort));
		const doc = docs[0];
		return doc ? (clone(project(doc, options.projection)) as T) : null;
	}

	find(filter: Filter = {}, options: FindOptions = {}): LocalCursor<T> {
		return new LocalCursor<T>(() => this.matching(filter), options);
	}

	async countDocuments(filter: Filter = {}): Promise<number> {
		return this.matching(filter).length;
	}

	aggregate(): never {
		throw new Error('LocalDb: aggregate is not supported (only the admin app uses it)');
	}

	// --- Writing ----------------------------------------------------------------------------

	async insertOne(input: T): Promise<{ acknowledged: true; insertedId: unknown }> {
		const doc = clone(input as Doc);
		doc._id ??= newId();
		const existing = this.docs.get(idKey(doc._id));
		if (existing && !this.expired(existing)) {
			throw duplicateKey(
				this.collectionName,
				{ name: '_id_', keys: [['_id', 1]], options: {} },
				doc
			);
		}
		this.checkUnique(doc);
		this.docs.set(idKey(doc._id), doc);
		this.db.changed();
		return { acknowledged: true, insertedId: doc._id };
	}

	async insertMany(inputs: T[]): Promise<{ acknowledged: true; insertedCount: number }> {
		for (const input of inputs) await this.insertOne(input);
		return { acknowledged: true, insertedCount: inputs.length };
	}

	async updateOne(
		filter: Filter,
		update: Update,
		options: { upsert?: boolean } = {}
	): Promise<UpdateResult> {
		return this.update(filter, update, options.upsert ?? false, false).result;
	}

	async updateMany(
		filter: Filter,
		update: Update,
		options: { upsert?: boolean } = {}
	): Promise<UpdateResult> {
		return this.update(filter, update, options.upsert ?? false, true).result;
	}

	async replaceOne(
		filter: Filter,
		replacement: T,
		options: { upsert?: boolean } = {}
	): Promise<UpdateResult> {
		const target = this.matching(filter)[0];
		const next = clone(replacement as Doc);
		if (target) {
			next._id = target._id;
			const modified = !equal(target, next);
			this.checkUnique(next, idKey(target._id));
			this.docs.set(idKey(target._id), next);
			if (modified) this.db.changed();
			return {
				acknowledged: true,
				matchedCount: 1,
				modifiedCount: modified ? 1 : 0,
				upsertedCount: 0,
				upsertedId: null
			};
		}
		if (!options.upsert) {
			return {
				acknowledged: true,
				matchedCount: 0,
				modifiedCount: 0,
				upsertedCount: 0,
				upsertedId: null
			};
		}
		next._id ??= seedFromFilter(filter)._id ?? newId();
		await this.insertOne(next as T);
		return {
			acknowledged: true,
			matchedCount: 0,
			modifiedCount: 0,
			upsertedCount: 1,
			upsertedId: next._id
		};
	}

	async findOneAndUpdate(
		filter: Filter,
		update: Update,
		options: { upsert?: boolean; returnDocument?: 'before' | 'after'; projection?: Projection } = {}
	): Promise<T | null> {
		const { before, after } = this.update(filter, update, options.upsert ?? false, false);
		const doc = options.returnDocument === 'after' ? after : before;
		return doc ? (clone(project(doc, options.projection)) as T) : null;
	}

	private update(
		filter: Filter,
		update: Update,
		upsert: boolean,
		many: boolean
	): { result: UpdateResult; before: Doc | null; after: Doc | null } {
		const targets = this.matching(filter);
		const chosen = many ? targets : targets.slice(0, 1);
		if (chosen.length === 0) {
			if (!upsert) {
				return {
					result: {
						acknowledged: true,
						matchedCount: 0,
						modifiedCount: 0,
						upsertedCount: 0,
						upsertedId: null
					},
					before: null,
					after: null
				};
			}
			const doc = clone(seedFromFilter(filter));
			applyUpdate(doc, update, true);
			doc._id ??= newId();
			if (this.docs.has(idKey(doc._id)) && !this.expired(this.docs.get(idKey(doc._id)) as Doc)) {
				throw duplicateKey(
					this.collectionName,
					{ name: '_id_', keys: [['_id', 1]], options: {} },
					doc
				);
			}
			this.checkUnique(doc);
			this.docs.set(idKey(doc._id), doc);
			this.db.changed();
			return {
				result: {
					acknowledged: true,
					matchedCount: 0,
					modifiedCount: 0,
					upsertedCount: 1,
					upsertedId: doc._id
				},
				before: null,
				after: doc
			};
		}
		// All or nothing: work on copies, check every unique index, then keep them.
		const changes = chosen.map((target) => {
			const next = clone(target);
			applyUpdate(next, update, false);
			return { target, next };
		});
		for (const { target, next } of changes) this.checkUnique(next, idKey(target._id));
		let modified = 0;
		for (const { target, next } of changes) {
			if (equal(target, next)) continue;
			this.docs.set(idKey(target._id), next);
			modified++;
		}
		if (modified) this.db.changed();
		return {
			result: {
				acknowledged: true,
				matchedCount: chosen.length,
				modifiedCount: modified,
				upsertedCount: 0,
				upsertedId: null
			},
			before: chosen[0],
			after: changes[0].next
		};
	}

	async deleteOne(filter: Filter = {}): Promise<{ acknowledged: true; deletedCount: number }> {
		const target = this.matching(filter)[0];
		if (!target) return { acknowledged: true, deletedCount: 0 };
		this.docs.delete(idKey(target._id));
		this.db.changed();
		return { acknowledged: true, deletedCount: 1 };
	}

	async deleteMany(filter: Filter = {}): Promise<{ acknowledged: true; deletedCount: number }> {
		const targets = this.matching(filter);
		for (const target of targets) this.docs.delete(idKey(target._id));
		if (targets.length) this.db.changed();
		return { acknowledged: true, deletedCount: targets.length };
	}

	async bulkWrite(operations: Doc[]): Promise<{
		matchedCount: number;
		modifiedCount: number;
		upsertedCount: number;
		insertedCount: number;
		deletedCount: number;
	}> {
		const total = {
			matchedCount: 0,
			modifiedCount: 0,
			upsertedCount: 0,
			insertedCount: 0,
			deletedCount: 0
		};
		for (const operation of operations) {
			const [kind, spec] = Object.entries(operation)[0] as [string, Doc];
			if (kind === 'insertOne') {
				await this.insertOne(spec.document as T);
				total.insertedCount++;
			} else if (kind === 'updateOne' || kind === 'updateMany') {
				const result = this.update(
					spec.filter as Doc,
					spec.update as Doc,
					spec.upsert === true,
					kind === 'updateMany'
				).result;
				total.matchedCount += result.matchedCount;
				total.modifiedCount += result.modifiedCount;
				total.upsertedCount += result.upsertedCount;
			} else if (kind === 'replaceOne') {
				const result = await this.replaceOne(spec.filter as Doc, spec.replacement as T, {
					upsert: spec.upsert === true
				});
				total.matchedCount += result.matchedCount;
				total.modifiedCount += result.modifiedCount;
				total.upsertedCount += result.upsertedCount;
			} else if (kind === 'deleteOne' || kind === 'deleteMany') {
				const result =
					kind === 'deleteOne'
						? await this.deleteOne(spec.filter as Doc)
						: await this.deleteMany(spec.filter as Doc);
				total.deletedCount += result.deletedCount;
			} else {
				throw new Error(`LocalDb: bulkWrite ${kind} is not supported`);
			}
		}
		return total;
	}

	// --- Saving -----------------------------------------------------------------------------

	/** @internal The documents, for the save file. */
	snapshot(): unknown[] {
		return this.live().map(toJson);
	}

	/** @internal From the save file. */
	restore(docs: unknown[]): void {
		this.docs.clear();
		for (const raw of docs) {
			const doc = fromJson(raw) as Doc;
			this.docs.set(idKey(doc._id), doc);
		}
	}
}

/** Map key for an `_id` (strings stay as they are; anything else by its JSON). */
const idKey = (id: unknown): string =>
	typeof id === 'string' ? id : `#${JSON.stringify(toJson(id))}`;

export interface LocalDbOptions {
	/** The save file. Missing: in memory only (the tests). */
	file?: string;
	/** Milliseconds to wait after a change before saving, so a burst of writes saves once. */
	saveDelay?: number;
	/** The clock (tests move it on). */
	now?: () => number;
}

/** The format of the save file. */
const SAVE_VERSION = 1;

export class LocalDb {
	readonly databaseName = 'local';
	readonly now: () => number;
	private collections = new Map<string, LocalCollection<Doc>>();
	private readonly file: string | undefined;
	private readonly saveDelay: number;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private purgeTimer: ReturnType<typeof setInterval> | null = null;
	private dirty = false;

	constructor(options: LocalDbOptions = {}) {
		this.file = options.file;
		this.saveDelay = options.saveDelay ?? 250;
		this.now = options.now ?? Date.now;
		if (this.file) this.load(this.file);
		if (this.file) {
			this.purgeTimer = setInterval(() => this.purge(), 60_000);
			this.purgeTimer.unref?.();
		}
	}

	collection<T = Doc>(name: string): LocalCollection<T> {
		let found = this.collections.get(name);
		if (!found) {
			found = new LocalCollection<Doc>(name, this);
			this.collections.set(name, found);
		}
		return found as unknown as LocalCollection<T>;
	}

	async command(command: Doc): Promise<{ ok: 1 }> {
		if ('ping' in command) return { ok: 1 };
		throw new Error(`LocalDb: command ${Object.keys(command)[0]} is not supported`);
	}

	/** This object as the `mongodb` `Db` the stores take: the one place it is passed off as one. */
	asDb(): Db {
		return this as unknown as Db;
	}

	/** @internal A collection changed: save soon. */
	changed(): void {
		if (!this.file) return;
		this.dirty = true;
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			this.save();
		}, this.saveDelay);
	}

	/** Write the save file now, if anything changed. Safe to call at any time. */
	save(): void {
		if (!this.file || !this.dirty) return;
		this.dirty = false;
		const data = {
			version: SAVE_VERSION,
			savedAt: new Date(this.now()).toISOString(),
			collections: Object.fromEntries(
				[...this.collections].map(([name, collection]) => [name, collection.snapshot()])
			)
		};
		mkdirSync(path.dirname(this.file), { recursive: true });
		// Written beside it, then swapped in: a crash mid-write leaves the last good save.
		const temp = `${this.file}.tmp`;
		writeFileSync(temp, JSON.stringify(data));
		if (existsSync(this.file)) renameSync(this.file, `${this.file}.bak`);
		renameSync(temp, this.file);
	}

	/** Save and stop the timers (the app is closing). */
	close(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = null;
		if (this.purgeTimer) clearInterval(this.purgeTimer);
		this.purgeTimer = null;
		this.save();
	}

	private purge(): void {
		for (const collection of this.collections.values()) collection.purgeExpired();
	}

	private load(file: string): void {
		for (const candidate of [file, `${file}.bak`]) {
			if (!existsSync(candidate)) continue;
			try {
				const data = JSON.parse(readFileSync(candidate, 'utf8')) as {
					version: number;
					collections: Record<string, unknown[]>;
				};
				if (data.version !== SAVE_VERSION) throw new Error(`save version ${data.version}`);
				for (const [name, docs] of Object.entries(data.collections)) {
					this.collection(name).restore(docs);
				}
				if (candidate !== file) this.dirty = true;
				return;
			} catch (error) {
				// Kept aside, never deleted: a broken save can still be looked at (or mended).
				const aside = `${candidate}.broken-${Date.now()}`;
				renameSync(candidate, aside);
				console.error(
					`LocalDb: ${candidate} could not be read (${(error as Error).message}); kept as ${aside}`
				);
			}
		}
		rmSync(`${file}.tmp`, { force: true });
	}
}
