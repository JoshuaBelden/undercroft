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
	/** Longest player name. */
	nameLength: 24,
	/** Name used when a player hasn't chosen one. */
	defaultName: 'Explorer'
};
