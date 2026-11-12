import type { Vec3 } from '../map/types.ts';
import type { EquipmentSlot, ItemStack } from '../player/types.ts';

/** An item lying in the map, as broadcast in each tick. See docs/dev/items.md. */
export interface WorldItemSnapshot {
	id: string;
	/** Key into ITEMS. */
	item: string;
	count: number;
	position: Vec3;
	yaw: number;
}

/**
 * A slot of the loot crate a player has open, as that player is told it: what is there, nothing,
 * or `'hidden'` for something not revealed yet (what it is is never sent).
 */
export type CrateSlot = ItemStack | null | 'hidden';

/** Which loot crates have been opened (their lids stay up) and which someone is going through. */
export interface CratesSnapshot {
	open: string[];
	busy: string[];
}

/** A thrown item in flight. */
export interface ProjectileSnapshot {
	id: string;
	item: string;
	position: Vec3;
}

/** A slot: in the stash (on the surface only) or somewhere in an inventory. */
export type SlotRef =
	| { area: 'stash'; index: number }
	| { area: 'backpack'; index: number }
	| { area: 'quick'; index: number }
	| { area: 'equipment'; slot: EquipmentSlot };

export type SlotArea = SlotRef['area'];

/**
 * Rearranging what you have. The same requests serve the pack screen underground (the
 * `inventory` message) and the Loadout page on the surface (`POST /api/explorer/loadout`).
 */
export type InventoryAction =
	/**
	 * Onto another slot: into it if it is empty (`count` moves part of a stack), onto a stack of
	 * the same item, or swapping places with what is there.
	 */
	| { kind: 'move'; from: SlotRef; to: SlotRef; count?: number }
	/** Shift-click: stash to loadout and back; underground, backpack to its slot and back. */
	| { kind: 'quick'; from: SlotRef }
	/** Into the weapon, defense or quick-use slot it belongs in. */
	| { kind: 'equip'; from: SlotRef }
	/** `count` of a stack into an empty slot beside it. */
	| { kind: 'split'; from: SlotRef; count: number }
	/** Underground: onto the floor in front of you. On the surface: gone for good. */
	| { kind: 'drop'; from: SlotRef; count: number };

/**
 * Something that happened this tick, for every client to show and hear (their own predicted
 * actions included: clients skip the local player's swing/shot/reload sounds they already
 * played).
 */
export type GameEvent =
	| {
			kind: 'shot';
			player: string;
			item: string;
			origin: Vec3;
			/** Where the first pellet stopped (wall or creature). */
			end: Vec3;
			creature: boolean;
	  }
	| { kind: 'swing'; player: string; item: string; origin: Vec3; hit: 'creature' | 'wall' | null }
	| { kind: 'throw'; player: string; item: string; origin: Vec3 }
	| { kind: 'land'; item: string; position: Vec3 }
	| { kind: 'break'; item: string; position: Vec3 }
	| { kind: 'reload'; player: string; item: string; position: Vec3 }
	| { kind: 'empty'; player: string; item: string; position: Vec3 }
	| { kind: 'pickup'; player: string; item: string; position: Vec3 }
	| { kind: 'drop'; player: string; item: string; position: Vec3 }
	| { kind: 'creatureHit'; id: string; position: Vec3 }
	/** `by`: the player who finished it off, if one did. */
	| { kind: 'creatureDie'; id: string; position: Vec3; by: string | null }
	/** A loot crate was opened for the first time. */
	| { kind: 'crateOpen'; id: string; player: string; position: Vec3 }
	/** Someone going through a crate started on the next thing in it. */
	| { kind: 'rummage'; player: string; position: Vec3 }
	/** A clue was found: the requirements (item ids) and room (piece id) it revealed. */
	| { kind: 'clue'; player: string; position: Vec3; requirements: string[]; room: string | null }
	/** The Affliction reached a new omen stage. */
	| { kind: 'omen'; stage: number }
	/** The Affliction manifests (it gathers, then hunts). */
	| { kind: 'manifest' };
