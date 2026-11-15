import { MongoClient, type Db } from 'mongodb';
import { localHost } from '../src/lib/server/local.ts';
import { ensureIndexes } from '../src/lib/server/store/accounts.ts';
import { config } from './config.ts';
import { log } from './log.ts';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connects to MongoDB. Players are identified through it, so without it the server runs but
 * nobody can connect.
 */
export async function connectDb(): Promise<Db | null> {
	// The desktop app: the player's local save (docs/dev/hosting.md), never MongoDB.
	const local = localHost();
	if (local) {
		await ensureIndexes(local.db);
		db = local.db;
		log.info('Local save connected');
		return db;
	}
	try {
		client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
		await client.connect();
		db = client.db(config.mongoDb);
		await db.command({ ping: 1 });
		await ensureIndexes(db);
		log.info(`MongoDB connected (${config.mongoDb})`);
		return db;
	} catch (error) {
		log.warn(
			`MongoDB unavailable: ${(error as Error).message}. Nobody can sign in without it: run "docker compose up -d".`
		);
		client = null;
		db = null;
		return null;
	}
}

export function getDb(): Db | null {
	return db;
}

export async function closeDb(): Promise<void> {
	await client?.close();
	db = null;
}
