import { DEFAULT_AFFLICTION } from '../../content/afflictions.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { buildCollisionWorld, type CollisionWorld } from '../map/collision.ts';
import { placeCrates } from '../map/crates.ts';
import { generateLayout } from '../map/generate.ts';
import { PIECES } from '../map/pieces.generated.ts';
import type { ColliderBox, MapLayout, PieceDef, Vec3, VolumeBox } from '../map/types.ts';

/**
 * Test fixtures (only imported by *.test.ts files). Real maps are built the way the server builds
 * them (server/session.ts `generate`), so tests cover the real kit and pieces.
 */

/** A map the way the server makes one: the layout, then its crates. */
export function realMap(seed: number, affliction = DEFAULT_AFFLICTION.id): MapLayout {
	const layout = generateLayout(seed, PIECES, MAP_KIT, { affliction });
	layout.crates = placeCrates(layout, PIECES, seed);
	return layout;
}

export function realWorld(layout: MapLayout): CollisionWorld {
	return buildCollisionWorld(layout, PIECES);
}

/** An axis-aligned collider: centre and size in metres. */
export function box(center: Vec3, size: Vec3): ColliderBox {
	return { center, halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2], rotation: [0, 0, 0, 1] };
}

/** A hand-built world: these colliders (and volumes, like water) as one piece placed at the origin. */
export function worldOf(colliders: ColliderBox[], volumes: VolumeBox[] = []): CollisionWorld {
	const piece: PieceDef = {
		name: 'test',
		url: '',
		bytes: 0,
		footprint: [1, 1],
		levels: 1,
		sockets: [],
		spawns: [],
		creatures: [],
		extracts: [],
		rites: [],
		crates: [],
		rubble: [],
		colliders,
		volumes,
		triangles: 0
	};
	const layout: MapLayout = {
		seed: 0,
		affliction: null,
		placements: [{ piece: 'test', position: [0, 0, 0], rotation: 0 }],
		crates: []
	};
	return buildCollisionWorld(layout, { test: piece });
}

/** A gameplay volume (water, squeeze) over this box. */
export function volume(kind: string, center: Vec3, size: Vec3): VolumeBox {
	return { kind, ...box(center, size) };
}

/** A 20 x 20 m floor slab whose top is at y = 0. */
export const FLOOR = box([0, -0.25, 0], [20, 0.5, 20]);
