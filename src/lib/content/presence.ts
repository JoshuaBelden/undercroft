/**
 * Steam rich presence: what friends see beside the player's name in Steam (desktop app only).
 * Steam shows `steam_display` as one of these tokens, with the English text that is uploaded to
 * the Steamworks partner site as deploy/steam/rich_presence.vdf (keep the two the same).
 * `%size%` is filled in from the `size` key. See docs/dev/desktop.md#rich-presence.
 */

export const PRESENCE = {
	hub: { token: '#Status_Hub', text: 'On the surface' },
	party: { token: '#Status_Party', text: 'On the surface, in a party of %size%' },
	solo: { token: '#Status_Solo', text: 'In the undercroft, alone' },
	coop: { token: '#Status_Coop', text: 'In the undercroft, %size% explorers' }
} as const;

export type PresenceState = keyof typeof PRESENCE;

/** Where the player is, as presence: underground or not, and with how many. */
export function presenceFor(underground: boolean, partySize: number): PresenceState {
	if (underground) return partySize > 1 ? 'coop' : 'solo';
	return partySize > 1 ? 'party' : 'hub';
}
