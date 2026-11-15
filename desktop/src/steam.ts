import { app } from 'electron';
import * as steamworks from 'steamworks.js';
import { STEAM_TICKET_IDENTITY, type SteamStatus } from '../../src/lib/shared/desktop.ts';

/**
 * Steamworks in the main process, through steamworks.js. Everything here works without Steam:
 * when Steam isn't running (or the app id isn't one this Steam account has), `status()` says so
 * and the rest do nothing, and the game signs in the usual way. See docs/dev/desktop.md#steam.
 */

type Client = ReturnType<typeof steamworks.init>;

let client: Client | null = null;
let appId = 0;

/**
 * Must run before the app is ready: the overlay needs Chromium switches set at startup. Returns
 * true when the app should quit because Steam is starting it again (a real app id, launched from
 * outside Steam).
 */
export function startSteam(id: number): boolean {
	appId = id;
	try {
		// Only with a real app id: Spacewar (480) is never "owned" this way, so it would loop.
		if (app.isPackaged && id !== 480 && steamworks.restartAppIfNecessary(id)) return true;
		client = steamworks.init(id);
		steamworks.electronEnableSteamOverlay();
		console.log(`Steam: ready (app ${id})`);
	} catch (error) {
		client = null;
		console.log(`Steam: not available (${error instanceof Error ? error.message : error})`);
	}
	return false;
}

export function steamStatus(): SteamStatus {
	if (!client) return { available: false, appId, steamId: null, persona: null };
	return {
		available: true,
		appId,
		steamId: client.localplayer.getSteamId().steamId64.toString(),
		persona: client.localplayer.getName()
	};
}

/** A Web API ticket, hex, for the site to check with Steam. Null if Steam refuses. */
export async function steamTicket(): Promise<string | null> {
	if (!client) return null;
	try {
		// Not cancelled: the site checks it with Steam after this returns.
		const ticket = await client.auth.getAuthTicketForWebApi(STEAM_TICKET_IDENTITY);
		return ticket.getBytes().toString('hex');
	} catch (error) {
		console.log(`Steam: no ticket (${error instanceof Error ? error.message : error})`);
		return null;
	}
}

export function steamAchievement(id: unknown): boolean {
	if (!client || typeof id !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(id)) return false;
	return client.achievement.activate(id);
}

export function steamPresence(key: unknown, value: unknown): void {
	if (!client || typeof key !== 'string' || !/^[A-Za-z0-9_#]{1,64}$/.test(key)) return;
	client.localplayer.setRichPresence(key, typeof value === 'string' ? value.slice(0, 255) : null);
}

/** The Steamworks client, for the lobby and the tunnel (null without Steam). */
export function steamClient(): Client | null {
	return client;
}

/**
 * steamworks.js's `const enum`s that aren't there at run time once bundled: their values. (Its
 * callbacks' enum is: `SteamCallback`.)
 */
export const STEAM = {
	/** `networking.SendType.Reliable`: in order, once, up to 1 MB. */
	reliable: 2,
	/** `matchmaking.LobbyType.FriendsOnly`. */
	friendsOnly: 1
} as const;
