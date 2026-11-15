import { STEAM_TICKET_IDENTITY } from '../shared/desktop.ts';

/**
 * "Continue with Steam" (desktop app only): check the Web API ticket the desktop app got from
 * Steam, and learn whose Steam account it is. Pure apart from `fetch`, which tests replace; the
 * route reads the settings from the environment. Imports by relative path so tests can load it.
 * See docs/dev/desktop.md#steam-sign-in.
 */

export interface SteamConfig {
	/** Publisher Web API key (Steamworks partner site). Empty: Steam sign-in is off. */
	key: string;
	appId: number;
	/**
	 * Local testing only, with Valve's test app (no publisher key for it): believe the SteamID the
	 * desktop app reports. Ignored unless `devMode` is on too.
	 */
	devTrust: boolean;
	devMode: boolean;
	fetch?: typeof fetch;
}

export type SteamCheck =
	{ steamId: string } | { error: 'off' | 'ticket' | 'banned' | 'unreachable' };

/** Steam sign-in is offered: a publisher key, or trusted local testing in dev mode. */
export const steamEnabled = (config: SteamConfig): boolean =>
	Boolean(config.key) || (config.devTrust && config.devMode);

const isSteamId = (value: unknown): value is string =>
	typeof value === 'string' && /^7656\d{13}$/.test(value);
const isTicket = (value: unknown): value is string =>
	typeof value === 'string' &&
	value.length >= 16 &&
	value.length <= 4096 &&
	/^[0-9a-f]+$/i.test(value);

/** The endpoint publisher keys use (not api.steampowered.com, which refuses them for this). */
const AUTHENTICATE = 'https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/';

/**
 * Whose Steam account a ticket is for. `claimed` is the SteamID the desktop app reports: only
 * believed in trusted local testing, never once there is a key.
 */
export async function verifySteamTicket(
	config: SteamConfig,
	ticket: unknown,
	claimed?: unknown
): Promise<SteamCheck> {
	if (!steamEnabled(config)) return { error: 'off' };
	if (!isTicket(ticket)) return { error: 'ticket' };
	if (!config.key) return isSteamId(claimed) ? { steamId: claimed } : { error: 'ticket' };

	const params = new URLSearchParams({
		key: config.key,
		appid: String(config.appId),
		ticket,
		identity: STEAM_TICKET_IDENTITY
	});
	let body: unknown;
	try {
		const response = await (config.fetch ?? fetch)(`${AUTHENTICATE}?${params}`, {
			signal: AbortSignal.timeout(8000)
		});
		if (!response.ok) return { error: response.status >= 500 ? 'unreachable' : 'ticket' };
		body = await response.json();
	} catch {
		return { error: 'unreachable' };
	}
	const result = (body as { response?: { params?: Record<string, unknown> } }).response?.params;
	if (!result || result.result !== 'OK' || !isSteamId(result.steamid)) return { error: 'ticket' };
	if (result.vacbanned === true || result.publisherbanned === true) return { error: 'banned' };
	return { steamId: result.steamid };
}

/** A Steam name as the desktop app reports it, safe to keep and show. Steam allows 32 chars. */
export function cleanPersona(raw: unknown): string {
	if (typeof raw !== 'string') return 'Steam player';
	const printable = [...raw].filter((char) => char >= ' ' && char !== '\u007f').join('');
	const persona = printable.trim().slice(0, 32);
	return persona || 'Steam player';
}

/** What the player is told for each way it can fail. */
export const STEAM_ERRORS: Record<Exclude<SteamCheck, { steamId: string }>['error'], string> = {
	off: 'Signing in with Steam is not available',
	ticket: "Steam couldn't confirm who you are. Restart Steam and try again",
	banned: 'This Steam account is banned from Undercroft',
	unreachable: "Couldn't reach Steam. Try again in a moment"
};
