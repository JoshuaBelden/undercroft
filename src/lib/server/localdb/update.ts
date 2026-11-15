import { compare, equal, getPath, isPlainObject, setPath, unsetPath, type Doc } from './values.ts';
import { matches } from './query.ts';

/**
 * Applying a MongoDB update document: the operators the game's stores use. Anything else throws.
 * See docs/dev/hosting.md#localdb.
 */

/** Change `doc` in place. `inserting`: this is an upsert's new document (`$setOnInsert` applies). */
export function applyUpdate(doc: Doc, update: Doc, inserting: boolean): void {
	for (const [op, fields] of Object.entries(update)) {
		if (!op.startsWith('$')) throw new Error('LocalDb: an update needs operators ($set, ...)');
		for (const [path, value] of Object.entries(fields as Doc)) {
			if (path === '_id' && op !== '$setOnInsert' && !inserting) {
				if (!equal(doc._id, value)) throw new Error('LocalDb: _id cannot be changed');
				continue;
			}
			switch (op) {
				case '$set':
					setPath(doc, path, value);
					break;
				case '$setOnInsert':
					if (inserting) setPath(doc, path, value);
					break;
				case '$unset':
					unsetPath(doc, path);
					break;
				case '$inc': {
					const current = getPath(doc, path);
					setPath(doc, path, (typeof current === 'number' ? current : 0) + (value as number));
					break;
				}
				case '$max': {
					const current = getPath(doc, path);
					if (current === undefined || current === null || compare(value, current) > 0) {
						setPath(doc, path, value);
					}
					break;
				}
				case '$addToSet': {
					const list = arrayAt(doc, path);
					const items = isPlainObject(value) && Array.isArray(value.$each) ? value.$each : [value];
					for (const item of items) if (!list.some((each) => equal(each, item))) list.push(item);
					break;
				}
				case '$push': {
					const list = arrayAt(doc, path);
					const items = isPlainObject(value) && Array.isArray(value.$each) ? value.$each : [value];
					list.push(...items);
					break;
				}
				case '$pull': {
					const current = getPath(doc, path);
					if (!Array.isArray(current)) break;
					const keep = current.filter((item) =>
						isPlainObject(value) &&
						isPlainObject(item) &&
						!Object.keys(value).some((k) => k.startsWith('$'))
							? !matches(item, value)
							: !equal(item, value)
					);
					setPath(doc, path, keep);
					break;
				}
				default:
					throw new Error(`LocalDb: update operator ${op} is not supported`);
			}
		}
	}
}

function arrayAt(doc: Doc, path: string): unknown[] {
	const current = getPath(doc, path);
	if (Array.isArray(current)) return current;
	if (current !== undefined && current !== null) {
		throw new Error(`LocalDb: ${path} is not an array`);
	}
	const list: unknown[] = [];
	setPath(doc, path, list);
	return list;
}

/** The document an upsert starts from: the filter's plain equalities (MongoDB does the same). */
export function seedFromFilter(filter: Doc): Doc {
	const doc: Doc = {};
	for (const [key, value] of Object.entries(filter)) {
		if (key.startsWith('$')) continue;
		if (isPlainObject(value) && Object.keys(value).some((k) => k.startsWith('$'))) {
			if ('$eq' in value) setPath(doc, key, value.$eq);
			continue;
		}
		if (value instanceof RegExp) continue;
		setPath(doc, key, value);
	}
	return doc;
}
