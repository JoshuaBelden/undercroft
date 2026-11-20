import {
	clearUnderground,
	itemsOwned,
	markReady,
	markWheelsOf,
	returnFromExpedition,
	takeLoadout
} from '../src/lib/server/store/explorers.ts';
import { discover, discoveredOf } from '../src/lib/server/store/discoveries.ts';
import { emptyInventory } from '../src/lib/shared/items/inventory.ts';
import type { Inventory } from '../src/lib/shared/player/types.ts';
import { getDb } from './db.ts';
import { guestLock, guestReturn, guestTake, guestTaken, isGuest } from './guests.ts';
import { log } from './log.ts';

/**
 * What explorers take down and bring back: the game server's side of the stash and loadout kept
 * in MongoDB. See docs/dev/economy.md. A co-op guest on a desktop game keeps theirs in their own
 * save: for them each of these asks their client instead (server/guests.ts, docs/dev/hosting.md).
 */

/**
 * Descent: the explorer's loadout leaves the surface with them; or, `free` with their own empty,
 * the free loadout (a co-op guest's save has no free loadout: they take their own).
 */
export async function takeKit(explorer: string, session: string, free = false): Promise<Inventory> {
	if (isGuest(explorer)) return (await guestTake(explorer, session)).kit;
	const db = getDb();
	if (!db) return emptyInventory();
	try {
		return await takeLoadout(db, explorer, session, free);
	} catch (error) {
		log.warn(`Could not take a loadout: ${(error as Error).message}`);
		return emptyInventory();
	}
}

/** Every item (id) these explorers keep on the surface, in their stash or loadout. */
export async function owned(explorers: string[]): Promise<Set<string>> {
	const items = new Set<string>();
	// Guests said what they own when they said what they take down (takeKit, asked first).
	for (const explorer of explorers.filter(isGuest)) {
		for (const item of (await guestTaken(explorer))?.owned ?? []) items.add(item);
	}
	const here = explorers.filter((explorer) => !isGuest(explorer));
	const db = getDb();
	if (!db || here.length === 0) return items;
	try {
		for (const item of await itemsOwned(db, here)) items.add(item);
	} catch (error) {
		log.warn(`Could not read what explorers own: ${(error as Error).message}`);
	}
	return items;
}

/**
 * The chalk wheel each of these explorers saved (those who never chose one aren't in it, and
 * `markWheel` gives them the default). Read at descent, like the loadout.
 */
export async function markWheels(explorers: string[]): Promise<Map<string, string[]>> {
	const wheels = new Map<string, string[]>();
	for (const explorer of explorers.filter(isGuest)) {
		const wheel = (await guestTaken(explorer))?.markWheel;
		if (wheel) wheels.set(explorer, wheel);
	}
	const here = explorers.filter((explorer) => !isGuest(explorer));
	const db = getDb();
	if (!db || here.length === 0) return wheels;
	try {
		for (const [explorer, wheel] of await markWheelsOf(db, here)) wheels.set(explorer, wheel);
	} catch (error) {
		log.warn(`Could not read chalk wheels: ${(error as Error).message}`);
	}
	return wheels;
}

/**
 * What each of these explorers has discovered, read at descent (docs/dev/crafting.md). A co-op
 * guest's discoveries stay with their own save: they discover nothing here.
 */
export async function discoveries(explorers: string[]): Promise<Map<string, Set<string>>> {
	const here = explorers.filter((explorer) => !isGuest(explorer));
	const db = getDb();
	if (!db || here.length === 0) return new Map();
	try {
		return await discoveredOf(db, here);
	} catch (error) {
		log.warn(`Could not read discoveries: ${(error as Error).message}`);
		return new Map();
	}
}

/** An explorer saw something in a lootable: kept for good. */
export function recordFind(explorer: string, item: string, source: string): void {
	if (isGuest(explorer)) return;
	const db = getDb();
	if (!db) return;
	discover(db, explorer, [{ item, source }]).catch((error: Error) =>
		log.warn(`Could not record a discovery: ${error.message}`)
	);
}

/** The expedition is over for them: what they carried out (null if it was lost) goes back. */
export function giveBack(explorer: string, session: string, carried: Inventory | null): void {
	if (isGuest(explorer)) {
		guestReturn(explorer, session, carried);
		return;
	}
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
	if (isGuest(explorer)) {
		guestLock(explorer, ready);
		return Promise.resolve();
	}
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
