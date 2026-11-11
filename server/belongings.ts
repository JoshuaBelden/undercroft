import {
	clearUnderground,
	returnFromExpedition,
	takeLoadout
} from '../src/lib/server/store/explorers.ts';
import { emptyInventory } from '../src/lib/shared/items/inventory.ts';
import type { Inventory } from '../src/lib/shared/player/types.ts';
import { getDb } from './db.ts';
import { log } from './log.ts';

/**
 * What explorers take down and bring back: the game server's side of the stash and loadout kept
 * in MongoDB. See docs/dev/economy.md.
 */

/** Descent: the explorer's loadout leaves the surface with them. */
export async function takeKit(explorer: string, session: string): Promise<Inventory> {
	const db = getDb();
	if (!db) return emptyInventory();
	try {
		return await takeLoadout(db, explorer, session);
	} catch (error) {
		log.warn(`Could not take a loadout: ${(error as Error).message}`);
		return emptyInventory();
	}
}

/** The expedition is over for them: what they carried out (null if it was lost) goes back. */
export function giveBack(explorer: string, session: string, carried: Inventory | null): void {
	const db = getDb();
	if (!db) return;
	returnFromExpedition(db, explorer, session, carried).catch((error: Error) =>
		log.warn(`Could not return belongings: ${error.message}`)
	);
}

/** At start: nobody is underground, whatever a crash left marked. */
export async function releaseAll(): Promise<void> {
	const db = getDb();
	if (!db) return;
	try {
		const released = await clearUnderground(db);
		if (released > 0) log.info(`Released ${released} explorers left underground by a restart`);
	} catch (error) {
		log.warn(`Could not release explorers: ${(error as Error).message}`);
	}
}
