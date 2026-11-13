import { sellPrice } from '../src/lib/content/economy.ts';
import { recordRun, writeServerStatus, type RunDoc } from '../src/lib/server/store/runs.ts';
import { allStacks } from '../src/lib/shared/items/inventory.ts';
import type { Inventory } from '../src/lib/shared/player/types.ts';
import { GAME_VERSION } from '../src/lib/shared/version.ts';
import { getDb } from './db.ts';
import { log } from './log.ts';
import type { Parties } from './parties.ts';

/**
 * Game stats for the admin app's dashboard and the balance pass: a line per player per
 * expedition, and how busy the server is. Writing them never holds up the game.
 * See docs/dev/admin.md#stats.
 */

/** How often the server's status is written. */
const STATUS_SECONDS = 15;

/** What a player brought out is worth at the store. */
export function carriedValue(carried: Inventory | null): number {
	if (!carried) return 0;
	return allStacks(carried).reduce((sum, stack) => sum + sellPrice(stack.item) * stack.count, 0);
}

/** Write one player's expedition. */
export function logRun(run: Omit<RunDoc, '_id' | 'at' | 'version'>): void {
	const db = getDb();
	if (!db) return;
	recordRun(db, { ...run, version: GAME_VERSION }).catch((error: unknown) =>
		log.warn(`Could not record a run: ${(error as Error).message}`)
	);
}

/** Write the server's status now and every few seconds; returns how to stop. */
export function watchStatus(parties: Parties): () => void {
	const startedAt = new Date();
	const write = (): void => {
		const db = getDb();
		if (!db) return;
		writeServerStatus(db, {
			version: GAME_VERSION,
			...parties.census(),
			startedAt,
			memoryMb: Math.round(process.memoryUsage().rss / 1048576)
		}).catch((error: unknown) =>
			log.warn(`Could not write the server status: ${(error as Error).message}`)
		);
	};
	write();
	const timer = setInterval(write, STATUS_SECONDS * 1000);
	return () => clearInterval(timer);
}
