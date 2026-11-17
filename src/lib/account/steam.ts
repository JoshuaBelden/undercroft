import { desktop } from '#lib/desktop.ts';
import type { SteamStatus } from '#lib/shared/desktop.ts';

/**
 * Steam, for signing in and linking (desktop app only): whether it is there, and the proof of who
 * the player is that `/api/auth/steam` and `/api/account/steam` check with Steam.
 * See docs/dev/desktop.md#steam-sign-in.
 */

/** Steam as the desktop app has it; null in a browser, or when Steam isn't running. */
export async function steamHere(): Promise<SteamStatus | null> {
	const status = await desktop()?.steam.status();
	return status?.available ? status : null;
}

export interface SteamProof {
	ticket: string;
	steamId: string;
	persona: string;
}

/** A fresh ticket from Steam, with who the app says the player is. Null if Steam refuses. */
export async function steamProof(): Promise<SteamProof | null> {
	const bridge = desktop();
	const status = await steamHere();
	if (!bridge || !status?.steamId) return null;
	const ticket = await bridge.steam.ticket();
	if (!ticket) return null;
	return { ticket, steamId: status.steamId, persona: status.persona ?? '' };
}
