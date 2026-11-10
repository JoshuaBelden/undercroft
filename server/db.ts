import { MongoClient, type Db } from 'mongodb';
import { config } from './config.ts';
import { log } from './log.ts';

let client: MongoClient | null = null;
let db: Db | null = null;

/** Connects to MongoDB. The server keeps running without a database in Phase 0. */
export async function connectDb(): Promise<Db | null> {
	try {
		client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
		await client.connect();
		db = client.db(config.mongoDb);
		await db.command({ ping: 1 });
		log.info(`MongoDB connected (${config.mongoDb})`);
		return db;
	} catch (error) {
		log.warn(`MongoDB unavailable: ${(error as Error).message}. Run "docker compose up -d".`);
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
}
