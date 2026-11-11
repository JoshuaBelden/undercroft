import { MongoClient, type Db } from 'mongodb';
import { MONGODB_DB, MONGODB_URI } from '$app/env/private';
import { ensureIndexes } from './store/accounts.ts';

let ready: Promise<Db> | null = null;

/** The database, connected on first use. Sign-in and the hub can't work without it. */
export function database(): Promise<Db> {
	ready ??= connect().catch((error: unknown) => {
		// Try again on the next request rather than failing for good.
		ready = null;
		throw error;
	});
	return ready;
}

async function connect(): Promise<Db> {
	const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
	await client.connect();
	const db = client.db(MONGODB_DB);
	await ensureIndexes(db);
	return db;
}
