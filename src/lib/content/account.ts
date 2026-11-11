/**
 * Account rules, shared by the sign-up form and the server that enforces them.
 * See docs/dev/accounts.md.
 */
export const ACCOUNT = {
	/** Gamer tag length. */
	tagMin: 3,
	tagMax: 24,
	passwordMin: 8,
	/** Days a browser stays signed in. */
	sessionDays: 30,
	/** Hours a game ticket can be used to connect to the game server. */
	ticketHours: 12
};

/** A gamer tag as typed, tidied; null if it isn't allowed. */
export function cleanTag(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const tag = raw.trim().replace(/\s+/g, ' ');
	if (tag.length < ACCOUNT.tagMin || tag.length > ACCOUNT.tagMax) return null;
	return /^[\p{L}\p{N} _-]+$/u.test(tag) ? tag : null;
}

/** An email address as typed, lower-cased; null if it doesn't look like one. */
export function cleanEmail(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const email = raw.trim().toLowerCase();
	return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
