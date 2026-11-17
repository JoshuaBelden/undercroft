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

/**
 * The hosted site the window shows, or null to run the game on this PC. `UNDERCROFT_URL` when
 * the app starts always wins; otherwise a hosted build (`--hosted`, desktop/build.mjs) shows the
 * site it was built for, and any other build runs its own.
 */
export function hostedSite(env: string | undefined, built: string, hosted: boolean): URL | null {
	if (env) return gameUrl(env, built);
	return hosted ? gameUrl(undefined, built) : null;
}

/** The app's link scheme: `undercroft://` opens it (registered by a hosted build). */
export const PROTOCOL = 'undercroft';

/**
 * The page an `undercroft://` link in `argv` asks for, on the game's own origin:
 * `undercroft://about/changes` opens /about/changes. Null when there is no such link, or it only
 * asks for the app (`undercroft://`), so the window stays where it is. Never another origin.
 */
export function protocolTarget(argv: readonly string[], game: URL): URL | null {
	const arg = argv.find((a) => a.toLowerCase().startsWith(`${PROTOCOL}:`));
	if (!arg) return null;
	let link: URL;
	try {
		link = new URL(arg);
	} catch {
		return null;
	}
	const path = `/${link.host}${link.pathname}`.replace(/[/\\]+/g, '/');
	if (path === '/' && !link.search) return null;
	const target = new URL(path + link.search, game.origin);
	return target.origin === game.origin ? target : null;
}
