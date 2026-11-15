import { MongoClient, type Db } from 'mongodb';
import { MONGODB_DB, MONGODB_URI } from '$app/env/private';
import { localHost } from './local.ts';
import { ensureIndexes } from './store/accounts.ts';

let ready: Promise<Db> | null = null;

/**
 * The database, connected on first use. Sign-in and the hub can't work without it. In the desktop
 * app it is the player's local save (src/lib/server/local.ts), not MongoDB.
 */
export function database(): Promise<Db> {
	ready ??= connect().catch((error: unknown) => {
		// Try again on the next request rather than failing for good.
		ready = null;
		throw error;
	});
	return ready;
}

async function connect(): Promise<Db> {
	const local = localHost();
	if (local) {
		await ensureIndexes(local.db);
		return local.db;
	}
	const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
	await client.connect();
	const db = client.db(MONGODB_DB);
	await ensureIndexes(db);
	return db;
}
