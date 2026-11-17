import { Binary } from 'mongodb';

/**
 * Values in LocalDb documents: copying, comparing, ordering, and reading and writing dotted paths.
 * MongoDB's rules, as far as the game's stores rely on them. See docs/dev/hosting.md#localdb.
 */

export type Doc = Record<string, unknown>;

const isBinary = (value: unknown): value is Binary =>
	typeof value === 'object' && value !== null && (value as Binary)._bsontype === 'Binary';

export const isPlainObject = (value: unknown): value is Doc =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	!(value instanceof Date) &&
	!(value instanceof RegExp) &&
	!isBinary(value) &&
	!(value instanceof Uint8Array);

/** A deep copy: what goes in and comes out of the database is never shared with the caller. */
export function clone<T>(value: T): T {
	if (value instanceof Date) return new Date(value.getTime()) as T;
	if (isBinary(value)) return new Binary(Buffer.from(value.buffer)) as T;
	if (value instanceof Uint8Array) return Buffer.from(value) as T;
	if (value instanceof RegExp) return new RegExp(value.source, value.flags) as T;
	if (Array.isArray(value)) return value.map(clone) as T;
	if (isPlainObject(value)) {
		const copy: Doc = {};
		for (const [key, inner] of Object.entries(value)) {
			if (inner !== undefined) copy[key] = clone(inner);
		}
		return copy as T;
	}
	return value;
}

/** MongoDB equality: by value for dates, binaries, arrays and documents. */
export function equal(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null || a === undefined || b === undefined) {
		return (a ?? null) === (b ?? null);
	}
	if (a instanceof Date || b instanceof Date) {
		return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
	}
	if (isBinary(a) && isBinary(b)) return Buffer.from(a.buffer).equals(Buffer.from(b.buffer));
	if (Array.isArray(a) || Array.isArray(b)) {
		return (
			Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((item, i) => equal(item, b[i]))
		);
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const keys = Object.keys(a).filter((key) => a[key] !== undefined);
		const other = Object.keys(b).filter((key) => b[key] !== undefined);
		return (
			keys.length === other.length &&
			keys.every((key, i) => key === other[i] && equal(a[key], b[key]))
		);
	}
	return false;
}

/** MongoDB's order between types, for the ones the game stores. */
function typeRank(value: unknown): number {
	if (value === null || value === undefined) return 0;
	if (typeof value === 'number') return 1;
	if (typeof value === 'string') return 2;
	if (isPlainObject(value)) return 3;
	if (Array.isArray(value)) return 4;
	if (isBinary(value)) return 5;
	if (typeof value === 'boolean') return 7;
	if (value instanceof Date) return 8;
	return 9;
}

/** Negative, zero or positive, as `a` sorts before, with or after `b`. */
export function compare(a: unknown, b: unknown): number {
	const ranks = typeRank(a) - typeRank(b);
	if (ranks !== 0) return ranks;
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
	if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
	if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
	return 0;
}

/**
 * Every value at a dotted path. Through an array, each element is followed, as MongoDB does for
 * `'accounts.id'` on an array of documents. Missing paths give `[undefined]`.
 */
export function valuesAt(doc: unknown, path: string): unknown[] {
	let current: unknown[] = [doc];
	for (const key of path.split('.')) {
		const next: unknown[] = [];
		for (const value of current) {
			if (Array.isArray(value)) {
				if (/^\d+$/.test(key)) next.push(value[Number(key)]);
				else for (const item of value) if (isPlainObject(item)) next.push(item[key]);
			} else if (isPlainObject(value)) {
				next.push(value[key]);
			} else {
				next.push(undefined);
			}
		}
		current = next;
	}
	return current.length > 0 ? current : [undefined];
}

/** The value at a dotted path, without following arrays (for updates and index keys). */
export function getPath(doc: Doc, path: string): unknown {
	let current: unknown = doc;
	for (const key of path.split('.')) {
		if (Array.isArray(current) && /^\d+$/.test(key)) current = current[Number(key)];
		else if (isPlainObject(current)) current = current[key];
		else return undefined;
	}
	return current;
}

/** Set a dotted path, making the documents on the way. */
export function setPath(doc: Doc, path: string, value: unknown): void {
	const keys = path.split('.');
	let current: Doc | unknown[] = doc;
	for (const key of keys.slice(0, -1)) {
		const container = current as Record<string, unknown>;
		const next = container[key];
		if (!isPlainObject(next) && !Array.isArray(next)) container[key] = {};
		current = container[key] as Doc;
	}
	(current as Record<string, unknown>)[keys[keys.length - 1]] = value;
}

/** Remove a dotted path (nothing happens if it isn't there). */
export function unsetPath(doc: Doc, path: string): void {
	const keys = path.split('.');
	const parent = keys.length === 1 ? doc : getPath(doc, keys.slice(0, -1).join('.'));
	if (isPlainObject(parent)) delete parent[keys[keys.length - 1]];
}

/** A new id for a document inserted without one, shaped like an ObjectId's hex. */
export function newId(): string {
	const bytes = new Uint8Array(12);
	crypto.getRandomValues(bytes);
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// --- On disk ----------------------------------------------------------------------------------

/** A value as JSON: dates and binaries tagged so they come back as themselves. */
export function toJson(value: unknown): unknown {
	if (value instanceof Date) return { $date: value.toISOString() };
	if (isBinary(value)) return { $binary: Buffer.from(value.buffer).toString('base64') };
	if (value instanceof Uint8Array) return { $binary: Buffer.from(value).toString('base64') };
	if (Array.isArray(value)) return value.map(toJson);
	if (isPlainObject(value)) {
		const out: Doc = {};
		for (const [key, inner] of Object.entries(value)) {
			if (inner !== undefined) out[key] = toJson(inner);
		}
		return out;
	}
	return value;
}

export function fromJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(fromJson);
	if (isPlainObject(value)) {
		const keys = Object.keys(value);
		if (keys.length === 1 && typeof value.$date === 'string') return new Date(value.$date);
		if (keys.length === 1 && typeof value.$binary === 'string') {
			return new Binary(Buffer.from(value.$binary, 'base64'));
		}
		const out: Doc = {};
		for (const [key, inner] of Object.entries(value)) out[key] = fromJson(inner);
		return out;
	}
	return value;
}
