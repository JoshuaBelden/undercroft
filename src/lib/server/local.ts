import type { Db } from 'mongodb';

/**
 * Local mode: the desktop app runs the site and the game server on the player's own PC, on a
 * LocalDb save, with nobody else's servers involved (docs/dev/hosting.md). The desktop app's
 * host process sets this before the site or the game server load; both read it from here. Shared
 * through `globalThis` so the site (bundled or run by Vite) and the game server see one object.
 * Imports by relative path, like the store.
 */

export interface LocalPlayer {
	/** Their 64-bit SteamID, or null when Steam isn't running (one local account, `LOCAL_ACCOUNT_ID`). */
	steamId: string | null;
	/** Their Steam name (or what the account starts as without Steam). */
	persona: string;
}

export interface LocalHost {
	/** The save (a LocalDb, as the stores' `Db`). */
	db: Db;
	/** The window's proof that it is the desktop app: the `undercroft.local` cookie's value. */
	secret: string;
	/** What the desktop app's tunnel presents to the game server for a co-op guest. */
	hostKey: string;
	player: LocalPlayer;
}

declare global {
	var __undercroftLocal: LocalHost | undefined;
}

/** The local host's settings, or null when this is the hosted site and game server. */
export function localHost(): LocalHost | null {
	return globalThis.__undercroftLocal ?? null;
}

/** Called once by the desktop app's host process, before the site or the game server start. */
export function registerLocalHost(host: LocalHost): void {
	globalThis.__undercroftLocal = host;
}

/** The cookie the desktop app sets on its window (main process): proof the request is from it. */
export const LOCAL_COOKIE = 'undercroft.local';

/** The local account's id when there is no Steam account to find it by. */
export const LOCAL_ACCOUNT_ID = 'local';

/** Headers the desktop app's tunnel sends with a co-op guest's connection to the game server. */
export const GUEST_HEADERS = {
	hostKey: 'x-undercroft-host-key',
	steamId: 'x-undercroft-guest'
} as const;
