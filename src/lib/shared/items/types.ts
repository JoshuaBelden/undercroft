import type { Vec3 } from '../map/types.ts';

/** An item lying in the map, as broadcast in each tick. See docs/dev/items.md. */
export interface WorldItemSnapshot {
	id: string;
	/** Key into ITEMS. */
	item: string;
	count: number;
	position: Vec3;
	yaw: number;
}

/** A thrown item in flight. */
export interface ProjectileSnapshot {
	id: string;
	item: string;
	position: Vec3;
}

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
	| { kind: 'creatureHit'; id: string; position: Vec3 }
	| { kind: 'creatureDie'; id: string; position: Vec3 }
	/** The Affliction reached a new omen stage. */
	| { kind: 'omen'; stage: number }
	/** The Affliction manifests (it gathers, then hunts). */
	| { kind: 'manifest' };
