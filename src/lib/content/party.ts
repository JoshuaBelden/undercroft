/**
 * Party rules. Shared by the server (authoritative) and the lobby UI.
 * See docs/dev/expedition.md.
 */
export const PARTY = {
	/** Most players in one party (and so in one expedition). */
	maxSize: 4,
	/**
	 * Seconds a player who drops out of an expedition is kept in it, standing where they were,
	 * before they are removed for good.
	 */
	reconnectSeconds: 60,
	/**
	 * Seconds a player whose connection drops on the surface keeps their place in the party: long
	 * enough to reload the page.
	 */
	lobbyGraceSeconds: 15,
	/** Seconds between everyone being ready and the descent. */
	countdownSeconds: 5,
	/** Seconds an invite to a party can be answered. */
	inviteSeconds: 60
};
