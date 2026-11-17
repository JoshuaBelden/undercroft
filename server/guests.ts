import type { WebSocket } from 'ws';
import { cleanMarkWheel } from '../src/lib/content/marks.ts';
import { emptyInventory, sanitizeInventory } from '../src/lib/shared/items/inventory.ts';
import { encode, type ServerMessage } from '../src/lib/shared/protocol.ts';
import type { Inventory } from '../src/lib/shared/player/types.ts';
import { log } from './log.ts';

/**
 * Co-op guests on a desktop game (docs/dev/hosting.md#the-vault). A guest's stash and loadout
 * are in their own save, on their own PC, so the host's game server asks their client for what
 * they take down and sends back what they carry out. Their explorer id is `steam:<SteamID>`; this
 * server keeps nothing of theirs in its database. Among friends, what a guest says they carry is
 * believed (checked for shape and limits, not ownership): see the trust notes in hosting.md.
 */

/** How long a guest's game has to say what it takes down before they go down with nothing. */
export const VAULT_TIMEOUT_MS = 5000;

interface TakeReply {
	kit: Inventory;
	owned: Set<string>;
	/** Null: they never chose one (the default wheel). */
	markWheel: string[] | null;
}

interface Guest {
	socket: WebSocket;
	/** Answers waited for, by request id. */
	waiting: Map<number, (message: Record<string, unknown> | null) => void>;
	/** The take for the expedition under way: shared by the kit, owned items and chalk wheel. */
	take: { session: string; reply: Promise<TakeReply> } | null;
	/** What they carried out while their connection was down: sent when they are back. */
	unsent: ServerMessage | null;
}

const guests = new Map<string, Guest>();
let nextId = 1;

/** The explorer id a guest plays as on the host's server. */
export const guestExplorer = (steamId: string): string => `steam:${steamId}`;

export const isGuest = (explorer: string): boolean => guests.has(explorer);

/** A guest connected (or connected again): this is now where their vault is asked. */
export function attachGuest(explorer: string, socket: WebSocket): void {
	const guest = guests.get(explorer);
	if (!guest) {
		guests.set(explorer, { socket, waiting: new Map(), take: null, unsent: null });
		return;
	}
	guest.socket = socket;
	if (guest.unsent) {
		const message = guest.unsent;
		guest.unsent = null;
		send(guest, message);
	}
}

/**
 * They left the party: anything still waited for is answered with nothing. They are forgotten,
 * unless what they carried out hasn't reached them yet: that waits for them to come back.
 */
export function forgetGuest(explorer: string): void {
	const guest = guests.get(explorer);
	if (!guest) return;
	for (const resolve of guest.waiting.values()) resolve(null);
	guest.waiting.clear();
	guest.take = null;
	if (!guest.unsent) guests.delete(explorer);
}

function send(guest: Guest, message: ServerMessage): boolean {
	if (guest.socket.readyState !== guest.socket.OPEN) return false;
	guest.socket.send(encode(message));
	return true;
}

/** Their client answered a `vault` request. */
export function vaultAnswer(explorer: string, message: Record<string, unknown>): void {
	const guest = guests.get(explorer);
	const id = typeof message.id === 'number' ? message.id : -1;
	const resolve = guest?.waiting.get(id);
	if (!guest || !resolve) return;
	guest.waiting.delete(id);
	resolve(message);
}

/** Descent: what this guest takes down, from their own save (asked once per expedition). */
export function guestTake(explorer: string, session: string): Promise<TakeReply> {
	const guest = guests.get(explorer);
	if (!guest) return Promise.resolve(emptyTake());
	if (guest.take?.session === session) return guest.take.reply;
	const id = nextId++;
	const reply = new Promise<TakeReply>((resolve) => {
		const timer = setTimeout(() => {
			guest.waiting.delete(id);
			log.warn(`Guest ${explorer} didn't say what they carry; they go down with nothing`);
			resolve(emptyTake());
		}, VAULT_TIMEOUT_MS);
		guest.waiting.set(id, (message) => {
			clearTimeout(timer);
			resolve(message ? readTake(message) : emptyTake());
		});
		if (!send(guest, { type: 'vault', id, op: 'take', session })) {
			clearTimeout(timer);
			guest.waiting.delete(id);
			resolve(emptyTake());
		}
	});
	guest.take = { session, reply };
	return reply;
}

/** The take under way for this guest's current expedition, if one was asked for. */
export function guestTaken(explorer: string): Promise<TakeReply> | null {
	return guests.get(explorer)?.take?.reply ?? null;
}

/** Their hub is locked while they are ready to descend, as for everyone else. */
export function guestLock(explorer: string, ready: boolean): void {
	const guest = guests.get(explorer);
	if (guest) send(guest, { type: 'vault', id: nextId++, op: 'lock', ready });
}

/** What they carried out (null: it was lost) goes back to their own save. */
export function guestReturn(explorer: string, session: string, carried: Inventory | null): void {
	const guest = guests.get(explorer);
	if (!guest) return;
	if (guest.take?.session === session) guest.take = null;
	const message: ServerMessage = { type: 'vault', id: nextId++, op: 'return', session, carried };
	// Not connected right now: it goes as soon as they are back (attachGuest).
	if (!send(guest, message)) guest.unsent = message;
}

function emptyTake(): TakeReply {
	return { kit: emptyInventory(), owned: new Set(), markWheel: null };
}

/** A guest's answer, checked: a well-formed kit, item ids, and a wheel of known symbols. */
function readTake(message: Record<string, unknown>): TakeReply {
	const kit = sanitizeInventory(message.kit) ?? emptyInventory();
	const owned = new Set(
		Array.isArray(message.owned)
			? message.owned.filter((item): item is string => typeof item === 'string').slice(0, 500)
			: []
	);
	// A wheel that isn't eight known symbols is the default one.
	const wheel = cleanMarkWheel(message.markWheel);
	return { kit, owned, markWheel: wheel ? [...wheel] : null };
}
