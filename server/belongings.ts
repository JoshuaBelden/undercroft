import {
	clearUnderground,
	itemsOwned,
	markReady,
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

/** Every item (id) these explorers keep on the surface, in their stash or loadout. */
export async function owned(explorers: string[]): Promise<Set<string>> {
	const db = getDb();
	if (!db || explorers.length === 0) return new Set();
	try {
		return await itemsOwned(db, explorers);
	} catch (error) {
		log.warn(`Could not read what explorers own: ${(error as Error).message}`);
		return new Set();
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

/**
 * Ready to descend (or not any more): the hub stops (or starts again) letting them change their
 * stash and loadout. Resolves once it is in place.
 */
export function lockKit(explorer: string, ready: boolean): Promise<void> {
	const db = getDb();
	if (!db) return Promise.resolve();
	// One at a time per explorer, in the order asked: the last one asked for is what holds.
	const next = (locking.get(explorer) ?? Promise.resolve())
		.then(() => markReady(db, explorer, ready))
		.catch((error: Error) => log.warn(`Could not mark an explorer ready: ${error.message}`))
		.finally(() => {
			if (locking.get(explorer) === next) locking.delete(explorer);
		});
	locking.set(explorer, next);
	return next;
}

/** The last lock or unlock under way for each explorer. */
const locking = new Map<string, Promise<void>>();

/** At start: nobody is underground or ready, whatever a crash left marked. */
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
