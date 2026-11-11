/**
 * Launching an expedition from the Expedition page: pressing Launch sends the player to the
 * Loadout page to confirm what they are taking, and confirming there makes them ready.
 * See docs/dev/expedition.md.
 */
export const launch: {
	/** The Loadout page is asking for the loadout to be confirmed. */
	confirming: boolean;
} = $state({ confirming: false });
