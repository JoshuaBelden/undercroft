import type { Vec3 } from '../../shared/map/types.ts';

/**
 * A fixed map: its rooms (built from art/export/rooms, ROOMS in rooms.generated.ts) and where each
 * stands, by hand until the assembly file places them (docs/handoff-pivot.md#blender). The server
 * lays every expedition out from this; nothing is generated. See docs/dev/fixed-map.md.
 */
export interface MapDef {
	id: string;
	/** As players see it, without "the" (the map screen's Under-Parish). */
	name: string;
	rooms: MapRoom[];
	/** Doors that stay shut, `<room>/<door marker>`: seams to rooms not built yet. */
	sealed: string[];
}

export interface MapRoom {
	/** A room in ROOMS. */
	room: string;
	/** Where its origin stands in the map (m). */
	position: Vec3;
	/** Quarter turns about +Y (counter-clockwise seen from above), 0-3. */
	rotation: number;
	/** Its depth: 0 above (the Sewer), then the Parish (1), the Ossuary (2), the Quarries (3). */
	depth: number;
}

/** The Under-Parish: for now the way in alone (#150), the Parish Walk to come past its last door. */
export const UNDER_PARISH: MapDef = {
	id: 'under-parish',
	name: 'Under-Parish',
	rooms: [{ room: 'sewer', position: [0, 0, 0], rotation: 0, depth: 0 }],
	sealed: ['sewer/door-1']
};
