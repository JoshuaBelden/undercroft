import type { Slots } from '../items/inventory.ts';
import type { Inventory } from '../player/types.ts';

/** An account as its own browser sees it (`GET /api/account`). See docs/dev/accounts.md. */
export interface AccountView {
	id: string;
	email: string;
	/** The name other players see. */
	gamerTag: string;
	/** The avatar shown for them (their upload, else their Discord avatar), or null for none. */
	avatar: string | null;
	/** The avatar is one they uploaded (it can be removed). */
	avatarUploaded: boolean;
	/** Their linked Discord account has an avatar: it shows when they have no upload. */
	discordAvatar: boolean;
	/** Has a password (an account made with Discord may not, until one is set). */
	hasPassword: boolean;
	/** The linked Discord account's username, or null. */
	discord: string | null;
	/** Two-step sign-in is on. */
	mfa: boolean;
	/** Recovery codes not used yet (0 when two-step sign-in is off). */
	recoveryCodesLeft: number;
	explorer: ExplorerView;
}

/** The account's explorer: what they own and what they have learned. */
export interface ExplorerView {
	id: string;
	money: number;
	/** What is kept on the surface: one entry per stash slot. */
	stash: Slots;
	/** What goes down on the next descent. */
	loadout: Inventory;
	/** In an expedition right now: nothing can be changed from the surface. */
	underground: boolean;
	/** Rite progress per Affliction (only those with any). */
	afflictions: { id: string; clues: number; resolved: boolean }[];
}
