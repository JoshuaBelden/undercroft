import { PUBLIC_GAME_SERVER_URL } from '$app/env/public';
import { PRESENCE, type PresenceState } from '#lib/content/presence.ts';
import {
	DESKTOP_BRIDGE_VERSION,
	type DesktopBridge,
	type LobbyStatus
} from '#lib/shared/desktop.ts';

/**
 * The desktop app (desktop/, Electron) from the page's side. In a browser there is none, and
 * everything here says so. Nothing else touches `window.undercroft`. See docs/dev/desktop.md.
 */

declare global {
	interface Window {
		/** Set by the desktop app's preload script; missing in a browser. */
		undercroft?: DesktopBridge;
	}
}

/** The desktop app's bridge, or null in a browser (or a desktop app too old for this page). */
export function desktop(): DesktopBridge | null {
	if (typeof window === 'undefined') return null;
	const bridge = window.undercroft;
	return bridge?.platform === 'desktop' && bridge.bridge === DESKTOP_BRIDGE_VERSION ? bridge : null;
}

export const isDesktop = (): boolean => desktop() !== null;

/** The configured game server: the hosted one, for a browser (and the first guess elsewhere). */
export function gameServerUrl(): string {
	return PUBLIC_GAME_SERVER_URL;
}

/**
 * The game server to connect to right now. In the desktop app that is its own, on this PC, or a
 * co-op host's through the tunnel (docs/dev/hosting.md); in a browser, the configured one.
 */
export async function currentGameServer(): Promise<string> {
	return (await desktop()?.gameServer()) || PUBLIC_GAME_SERVER_URL;
}

/** Called when the desktop app switches game server (we joined or left a friend's game). */
export function onGameServerChange(listener: (url: string) => void): () => void {
	return desktop()?.onGameServer(listener) ?? (() => {});
}

/** The desktop app's own local game (docs/dev/hosting.md), not a hosted site in its window. */
export const isLocal = (): boolean => desktop()?.local === true;

let joinable: boolean | null = null;

/** Friends can join the party only on the surface: tell Steam's lobby when that changes. */
export function setJoinable(open: boolean): void {
	const party = desktop()?.party;
	if (!party || joinable === open) return;
	joinable = open;
	void party.setJoinable(open);
}

/** The Steam party as it is now, and whenever it changes (desktop app only). Returns how to stop. */
export function watchParty(listener: (status: LobbyStatus) => void): () => void {
	const party = desktop()?.party;
	if (!party) return () => {};
	void party.status().then((status) => {
		if (status) listener(status);
	});
	return party.onChange(listener);
}

/** We are a co-op guest and the host sent us home: back to our own game. */
export function leaveFriendsGame(): void {
	void desktop()?.party.leave();
}

/** Unlock a Steam achievement (desktop with Steam only; a browser does nothing). */
export function unlockAchievement(id: string): void {
	void desktop()?.steam.achievement(id);
}

let shownPresence = '';

/**
 * What friends see on Steam (src/lib/content/presence.ts). `group` puts the party together in
 * their friends list (Steam's `steam_player_group`). Only sent to Steam when it changes.
 */
export function setPresence(state: PresenceState, size: number, group: string | null): void {
	const steam = desktop()?.steam;
	const key = `${state}:${size}:${group}`;
	if (!steam || key === shownPresence) return;
	shownPresence = key;
	void steam.presence('size', String(size));
	void steam.presence('steam_player_group', group);
	void steam.presence('steam_player_group_size', group ? String(size) : null);
	void steam.presence('steam_display', PRESENCE[state].token);
}

/** Close the desktop app (from the main menu). Does nothing in a browser. */
export function quitApp(): void {
	void desktop()?.quit();
}
