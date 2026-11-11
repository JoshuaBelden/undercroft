import type { Slots } from '../items/inventory.ts';
import type { Inventory } from '../player/types.ts';

/** An account as its own browser sees it (`GET /api/account`). See docs/dev/accounts.md. */
export interface AccountView {
	id: string;
	email: string;
	/** The name other players see. */
	gamerTag: string;
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
