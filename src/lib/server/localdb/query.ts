import { compare, equal, isPlainObject, valuesAt, type Doc } from './values.ts';

/**
 * Whether a document matches a MongoDB filter: the operators the game's stores use. Anything
 * else throws, so a store that starts using one fails its tests instead of silently matching
 * wrongly. See docs/dev/hosting.md#localdb.
 */

const isOperators = (value: unknown): value is Doc =>
	isPlainObject(value) &&
	Object.keys(value).length > 0 &&
	Object.keys(value).every((k) => k.startsWith('$'));

export function matches(doc: Doc, filter: Doc): boolean {
	for (const [key, condition] of Object.entries(filter)) {
		if (key === '$or') {
			if (!(condition as Doc[]).some((each) => matches(doc, each))) return false;
		} else if (key === '$and') {
			if (!(condition as Doc[]).every((each) => matches(doc, each))) return false;
		} else if (key.startsWith('$')) {
			throw new Error(`LocalDb: query operator ${key} is not supported`);
		} else if (!fieldMatches(valuesAt(doc, key), condition)) {
			return false;
		}
	}
	return true;
}

/** Each value at the path, and each element of an array there: what a condition is tested on. */
function candidates(values: unknown[]): unknown[] {
	const out: unknown[] = [];
	for (const value of values) {
		out.push(value);
		if (Array.isArray(value)) out.push(...value);
	}
	return out;
}

/** Equality as a filter means it: an array field matches if it, or any element, is equal. */
function equals(values: unknown[], wanted: unknown): boolean {
	if (wanted instanceof RegExp) {
		return candidates(values).some((value) => typeof value === 'string' && wanted.test(value));
	}
	return candidates(values).some((value) => equal(value, wanted));
}

function fieldMatches(values: unknown[], condition: unknown): boolean {
	if (!isOperators(condition)) return equals(values, condition);
	const options = typeof condition.$options === 'string' ? condition.$options : '';
	for (const [op, operand] of Object.entries(condition)) {
		switch (op) {
			case '$eq':
				if (!equals(values, operand)) return false;
				break;
			case '$ne':
				if (equals(values, operand)) return false;
				break;
			case '$in':
				if (!(operand as unknown[]).some((each) => equals(values, each))) return false;
				break;
			case '$nin':
				if ((operand as unknown[]).some((each) => equals(values, each))) return false;
				break;
			case '$gt':
			case '$gte':
			case '$lt':
			case '$lte': {
				const ok = candidates(values).some((value) => {
					if (value === undefined || compareable(value, operand) === false) return false;
					const order = compare(value, operand);
					return op === '$gt'
						? order > 0
						: op === '$gte'
							? order >= 0
							: op === '$lt'
								? order < 0
								: order <= 0;
				});
				if (!ok) return false;
				break;
			}
			case '$exists': {
				const present = values.some((value) => value !== undefined);
				if (present !== Boolean(operand)) return false;
				break;
			}
			case '$type':
				if (operand !== 'string')
					throw new Error(`LocalDb: $type ${String(operand)} is not supported`);
				if (!values.some((value) => typeof value === 'string')) return false;
				break;
			case '$size':
				if (!values.some((value) => Array.isArray(value) && value.length === operand)) return false;
				break;
			case '$regex': {
				const pattern = operand instanceof RegExp ? operand : new RegExp(String(operand), options);
				if (!candidates(values).some((value) => typeof value === 'string' && pattern.test(value))) {
					return false;
				}
				break;
			}
			case '$options':
				break;
			default:
				throw new Error(`LocalDb: query operator ${op} is not supported`);
		}
	}
	return true;
}

/** Comparisons only hold between values of the same kind (MongoDB's type bracketing). */
function compareable(value: unknown, operand: unknown): boolean {
	if (value instanceof Date || operand instanceof Date) {
		return value instanceof Date && operand instanceof Date;
	}
	return typeof value === typeof operand && value !== null && operand !== null;
}

/** Sort documents by a MongoDB sort spec (`{ votes: -1, createdAt: 1 }`). */
export function sorter(spec: Record<string, 1 | -1>): (a: Doc, b: Doc) => number {
	const keys = Object.entries(spec);
	return (a, b) => {
		for (const [path, direction] of keys) {
			const order = compare(valuesAt(a, path)[0], valuesAt(b, path)[0]);
			if (order !== 0) return direction < 0 ? -order : order;
		}
		return 0;
	};
}

/** Apply an inclusion (`{ a: 1 }`) or exclusion (`{ a: 0 }`) projection. */
export function project(doc: Doc, projection: Record<string, 0 | 1 | boolean> | undefined): Doc {
	if (!projection || Object.keys(projection).length === 0) return doc;
	const entries = Object.entries(projection);
	const including = entries.some(([key, on]) => key !== '_id' && Boolean(on));
	if (!including) {
		const out: Doc = { ...doc };
		for (const [key, on] of entries) if (!on) delete out[key];
		return out;
	}
	const out: Doc = {};
	if (projection._id !== 0 && projection._id !== false && '_id' in doc) out._id = doc._id;
	for (const [key, on] of entries) {
		if (key === '_id' || !on) continue;
		// Top-level fields only: that is all the stores ask for.
		if (key in doc) out[key] = doc[key];
	}
	return out;
}
