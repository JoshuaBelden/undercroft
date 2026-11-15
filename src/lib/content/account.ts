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
	ticketHours: 12,
	/** Minutes an emailed password-reset link works for. */
	resetMinutes: 60,
	/** Minutes to enter the two-step code after the password (or Discord) was accepted. */
	challengeMinutes: 5,
	/** Minutes to choose a gamer tag after signing up with Discord. */
	signupMinutes: 15,
	/** One-time codes given when two-step sign-in is turned on, for a lost phone. */
	recoveryCodeCount: 8,
	/** Seconds each authenticator code lasts, and how many digits it has (RFC 6238 defaults). */
	totpPeriod: 30,
	totpDigits: 6
};

/**
 * Avatars: the picture beside the gamer tag (docs/dev/accounts.md#avatars). The Account screen
 * crops what the player chooses to a square of `uploadSize`; the server checks it and keeps it as
 * a `size` WebP.
 */
export const AVATAR = {
	/** Pixels square, as stored and served. */
	size: 256,
	/** Pixels square the crop editor sends (more than `size`, so the server scales it down). */
	uploadSize: 512,
	/** WebP quality the server stores it at. */
	quality: 82,
	/** Largest upload accepted, in bytes (under the site's 512 KB request limit). */
	maxUploadBytes: 400 * 1024,
	/** Largest picture the crop editor will open, in bytes. */
	maxSourceBytes: 20 * 1024 * 1024,
	/** Zoom range in the crop editor: 1 fills the square with the picture's short side. */
	zoomMax: 4
};

/**
 * What a deleted account's bug reports, ideas and feedback say instead of who wrote them
 * (`deleteAccount` in src/lib/server/store/deletion.ts).
 */
export const DELETED_ACCOUNT = { id: 'deleted', gamerTag: 'Deleted player' } as const;

/**
 * How often each thing may be tried before it is refused for a while: `count` tries per `minutes`.
 * Keyed by the email or account (and, for the emails we send, by the address they came from too).
 * `signIn` and `code` count only wrong passwords and codes; `forgot` counts every email sent.
 */
export const THROTTLE = {
	signIn: { count: 10, minutes: 15 },
	forgot: { count: 3, minutes: 60 },
	forgotFromAddress: { count: 10, minutes: 60 },
	code: { count: 6, minutes: 15 },
	// Player reports (docs/dev/reports.md), per account: every one sent counts.
	report: { count: 6, minutes: 60 },
	idea: { count: 5, minutes: 60 },
	feedback: { count: 6, minutes: 60 },
	vote: { count: 120, minutes: 60 },
	// A new avatar, per account: every upload counts.
	avatar: { count: 10, minutes: 60 }
} satisfies Record<string, { count: number; minutes: number }>;

export type ThrottleRule = keyof typeof THROTTLE;

/**
 * What came of a trip to Discord, said to the player: the `?discord=` the sign-in page or the
 * Account screen is sent back with.
 */
export const DISCORD_RESULTS: Record<string, { message: string; error: boolean }> = {
	cancelled: { message: 'Discord sign-in was cancelled', error: true },
	failed: { message: "Discord didn't answer. Try again in a moment", error: true },
	unverified: {
		message: 'Your Discord account has no verified email. Verify it on Discord, then try again',
		error: true
	},
	email: {
		message:
			'That email already has an account. Sign in with your password, then link Discord from your Account screen',
		error: true
	},
	taken: {
		message: 'That Discord account is already linked to another Undercroft account',
		error: true
	},
	linked: { message: 'Discord is linked. You can sign in with it now', error: false },
	suspended: { message: 'This account is suspended', error: true }
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
