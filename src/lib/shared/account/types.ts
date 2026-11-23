import type { QuestRecord } from '../quests/types.ts';
import type { StoreTier } from '../../content/economy.ts';
import type { Slots } from '../items/inventory.ts';
import type { Inventory } from '../player/types.ts';
import type { Progression } from '../progression/progression.ts';

/** An account as its own browser sees it (`GET /api/account`). See docs/dev/accounts.md. */
export interface AccountView {
	id: string;
	/** Null for an account made with Steam, until they add one. */
	email: string | null;
	/** The name other players see. */
	gamerTag: string;
	/** The avatar shown for them (their upload, else their Discord avatar), or null for none. */
	avatar: string | null;
	/** The avatar is one they uploaded (it can be removed). */
	avatarUploaded: boolean;
	/** Their linked Discord account has an avatar: it shows when they have no upload. */
	discordAvatar: boolean;
	/** Has a password (an account made with Discord or Steam may not, until one is set). */
	hasPassword: boolean;
	/** The linked Discord account's username, or null. */
	discord: string | null;
	/** The linked Steam account's name, or null. */
	steam: string | null;
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
	/** The eight chalk symbols on their wheel, top first and clockwise. */
	markWheel: string[];
	/** Rite progress per Affliction (only those with any). */
	afflictions: { id: string; clues: number; resolved: boolean }[];
	/** Discovered items, each with the lootable kinds it has been seen in. */
	discovered: Record<string, string[]>;
	/** Discovered and not yet looked at (their slots shimmer). */
	fresh: string[];
	/** Coin sold to the store, in all: the merchant's trust. */
	sold: number;
	/** The store's tiers open to them. */
	tiers: StoreTier[];
	/** Experience and the skills spent on (docs/dev/progression.md). */
	progression: Pick<Progression, 'xp' | 'categories' | 'skills'>;
	/** Quests (docs/dev/quests.md): each one's progress and what is committed, and flags. */
	quests: QuestRecord;
}
