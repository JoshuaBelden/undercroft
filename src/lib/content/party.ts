/**
 * Party rules. Shared by the server (authoritative) and the lobby UI.
 * See docs/dev/expedition.md.
 */
export const PARTY = {
	/** Most players in one party (and so in one expedition). */
	maxSize: 4,
	/** Invite code length. */
	codeLength: 5,
	/** Characters used in invite codes: no 0/O, 1/I/L, so a code can be read out loud. */
	codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
	/**
	 * Seconds a player who drops out of an expedition is kept in it, standing where they were,
	 * before they are removed for good.
	 */
	reconnectSeconds: 60
};
