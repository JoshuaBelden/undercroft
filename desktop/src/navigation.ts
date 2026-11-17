/**
 * Where the desktop window may go. The game's own site stays in the window, and so does the
 * Discord sign-in round trip (its session cookie has to land in this window, not the system
 * browser). Anything else (GitHub, the source link, the credits' links) opens in the system
 * browser. Pure, so it is unit tested without Electron. See docs/dev/desktop.md#navigation.
 */

/** Discord pages the sign-in round trip passes through, before it comes back to the game. */
const DISCORD_SIGN_IN = ['https://discord.com/oauth2/', 'https://discord.com/login'];

export type Destination = 'window' | 'browser' | 'blocked';

/** Where a link to `target` should open, for a window showing the game at `gameOrigin`. */
export function destination(gameOrigin: string, target: string): Destination {
	let url: URL;
	try {
		url = new URL(target);
	} catch {
		return 'blocked';
	}
	if (url.origin === gameOrigin) return 'window';
	if (DISCORD_SIGN_IN.some((prefix) => url.href.startsWith(prefix))) return 'window';
	// Only web links leave for the system browser: never file:, javascript: or custom schemes.
	return url.protocol === 'https:' || url.protocol === 'http:' ? 'browser' : 'blocked';
}

/** The origin of the game the window shows: `UNDERCROFT_URL` if set, else the live site. */
export function gameUrl(env: string | undefined, fallback: string): URL {
	try {
		return new URL(env || fallback);
	} catch {
		return new URL(fallback);
	}
}
