/**
 * Launching an expedition from the Expedition page: pressing Launch sends the player to the
 * Loadout page to confirm what they are taking, and confirming there makes them ready.
 * See docs/dev/expedition.md.
 */
export const launch: {
	/** The Loadout page is asking for the loadout to be confirmed. */
	confirming: boolean;
	/** It offers the free loadout (held Y): the store link gives up its held Y meanwhile. */
	free: boolean;
} = $state({ confirming: false, free: false });
