import { UNDER_PARISH, type MapDef } from '../../content/map/under-parish.ts';
import { roomCrates } from './crates.ts';
import { placeDoors } from './doors.ts';
import { ROOMS } from './rooms.generated.ts';
import type { MapLayout, PieceDef, RoomDef } from './types.ts';

/**
 * The fixed map (docs/dev/fixed-map.md): every expedition is laid out from the map's data, its
 * rooms where they stand, nothing generated. The layout is the same shape the generator's was
 * (one placement per room), so collision, doors, ropes and crates read it as they did.
 */

/** Every room the map is built of, as the pieces a layout names. */
export const MAP_PIECES: Record<string, RoomDef> = ROOMS;

/** The map laid out: its rooms, a crate at every lootable marker, a door at every door marker. */
export function fixedLayout(
	seed: number,
	map: MapDef = UNDER_PARISH,
	pieces: Record<string, PieceDef> = MAP_PIECES
): MapLayout {
	for (const { room } of map.rooms) {
		if (!pieces[room]) throw new Error(`The map names a room that isn't built: "${room}"`);
	}
	const layout: MapLayout = {
		seed,
		affliction: null,
		placements: map.rooms.map(({ room, position, rotation, depth }) => ({
			piece: room,
			position,
			rotation,
			tier: depth
		})),
		crates: [],
		doors: []
	};
	layout.crates = roomCrates(layout, pieces);
	layout.doors = placeDoors(layout, pieces);
	return layout;
}

/** The ids of the doors the map keeps shut (`MapDef.sealed`: seams to rooms not built yet). */
export function sealedDoors(layout: MapLayout, map: MapDef = UNDER_PARISH): string[] {
	return layout.doors
		.filter((door) => door.marker && map.sealed.includes(`${door.piece}/${door.marker}`))
		.map((door) => door.id);
}
