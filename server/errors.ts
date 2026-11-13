import { fingerprint, recordError } from '../src/lib/server/store/reports.ts';
import { GAME_VERSION } from '../src/lib/shared/version.ts';
import { getDb } from './db.ts';
import { log } from './log.ts';

/** The same error is written to the database at most this often (a tick runs 20 times a second). */
const RECORD_EVERY_SECONDS = 60;

const recent = new Map<string, { id: string; at: number }>();

/**
 * Something on the game server threw. It is logged, and recorded in `errors` for the admin app,
 * and the id is returned so the players it happened to can be asked to report it (the client's
 * crash prompt). Never throws. See docs/dev/reports.md#crashes.
 */
export async function serverCrash(error: unknown, where: string): Promise<string | null> {
	const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	const stack = error instanceof Error ? error.stack : undefined;
	const key = fingerprint('game', message, stack);
	const seen = recent.get(key);
	if (seen && Date.now() - seen.at < RECORD_EVERY_SECONDS * 1000) return seen.id;
	log.error(`${where}: ${stack ?? message}`);
	const db = getDb();
	if (!db) return null;
	try {
		const id = await recordError(db, { source: 'game', message, stack, version: GAME_VERSION });
		recent.set(key, { id, at: Date.now() });
		return id;
	} catch (failure) {
		log.warn(`Could not record an error: ${(failure as Error).message}`);
		return null;
	}
}

/** The message a crash is shown to players with: the error's first line, without a stack. */
export function crashMessage(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
