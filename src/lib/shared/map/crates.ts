import { CORPSES, CRATES } from '../../content/loot.ts';
import { Rng } from '../rng.ts';
import { boxesNear, buildCollisionWorld, hasFloor, sphereVsBox, volumesAt } from './collision.ts';
import type { CollisionWorld } from './collision.ts';
import { toWorld } from './grid.ts';
import { spawnPoint } from './points.ts';
import type { CratePlacement, MapLayout, PieceDef, Vec3 } from './types.ts';

const round = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Which of the map's crate markers (`crate-*` empties in the pieces) have a loot crate, and which
 * of those are a corpse instead (searched the same way). Seeded by the map seed. The server calls
 * this once the layout is generated and puts the result in `layout.crates`; from there crates are
 * part of the collision world on both sides. Corpses are not solid.
 *
 * About `CORPSES.share` of the crates become corpses, but only where the whole body lies clear of
 * walls and the other crates, on a dry floor; elsewhere they stay crates. Markers in the start room
 * are always left empty. See docs/dev/items.md.
 */
export function placeCrates(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	seed: number
): CratePlacement[] {
	const rng = new Rng(seed ^ 0xc4a7e);
	const start = spawnPoint(layout, pieces).position;
	const crates: CratePlacement[] = [];
	for (const placement of layout.placements) {
		for (const marker of pieces[placement.piece]?.crates ?? []) {
			// Roll for every marker, so one crate more or less doesn't reshuffle the rest.
			const filled = rng.next() < CRATES.fill;
			const position = toWorld(placement, marker.position);
			const away = Math.hypot(position[0] - start[0], position[2] - start[2]);
			const atStart = placement === layout.placements[0];
			if (atStart || !filled || away < CRATES.minDistance) continue;
			crates.push({
				id: `c${crates.length + 1}`,
				position: position.map(round) as Vec3,
				yaw: round(marker.yaw + (placement.rotation * Math.PI) / 2)
			});
		}
	}

	// Corpses: their own stream, so which markers have crates doesn't change with them.
	const bodies = new Rng(seed ^ 0xc0b5e);
	const want = Math.round(crates.length * CORPSES.share);
	// Walls only: the crates are checked one by one, as some of them turn into corpses.
	const world = buildCollisionWorld({ ...layout, crates: [] }, pieces);
	let turned = 0;
	for (const crate of bodies.shuffle([...crates])) {
		if (turned >= want) break;
		// Its back along the same wall as the crate's: pushed out by the difference in depth.
		const out = CORPSES.size[2] / 2 - CRATES.size[2] / 2;
		const centre: Vec3 = [
			crate.position[0] + Math.sin(crate.yaw) * out,
			crate.position[1],
			crate.position[2] + Math.cos(crate.yaw) * out
		];
		const others = crates.filter((other) => other !== crate);
		if (others.some((other) => crowds(other, centre, crate.yaw))) continue;
		if (!corpseFits(world, centre, crate.yaw)) continue;
		crate.position = centre.map(round) as Vec3;
		// Either way round: the footprint is the same.
		crate.yaw = round(crate.yaw + (bodies.next() < 0.5 ? 0 : Math.PI));
		crate.kind = 'corpse';
		turned++;
	}
	return crates;
}

/**
 * True when `other` (a crate or another corpse) is too close to a corpse lying at `centre`,
 * turned to `yaw`: inside its footprint grown by half a crate, or a body's length from another.
 */
function crowds(other: CratePlacement, centre: Vec3, yaw: number): boolean {
	const dx = other.position[0] - centre[0];
	const dz = other.position[2] - centre[2];
	if (Math.abs(other.position[1] - centre[1]) > 1) return false;
	if (other.kind === 'corpse') return Math.hypot(dx, dz) < CORPSES.size[0];
	// Into the corpse's own frame (the inverse of its turn).
	const x = dx * Math.cos(yaw) - dz * Math.sin(yaw);
	const z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
	const pad = CRATES.size[0] / 2;
	return Math.abs(x) < CORPSES.size[0] / 2 + pad && Math.abs(z) < CORPSES.size[2] / 2 + pad;
}

/**
 * True when a corpse at `centre` (floor level), turned to `yaw`, touches no wall, crate or
 * column, lies on floor all over and is out of the water.
 */
function corpseFits(world: CollisionWorld, centre: Vec3, yaw: number): boolean {
	const [w, h, d] = CORPSES.size;
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	const at = (x: number, y: number, z: number): Vec3 => [
		centre[0] + x * cos + z * sin,
		centre[1] + y,
		centre[2] - x * sin + z * cos
	];
	// A sprawled body doesn't fill the corners of its box, and its back lies on the wall line where a
	// crate's would: test a little inside the edges.
	const inset = CORPSES.inset;
	const step = 0.25;
	for (let x = -w / 2 + inset; x <= w / 2 - inset + 1e-6; x += step) {
		for (let z = -d / 2 + inset; z <= d / 2 - inset + 1e-6; z += step) {
			for (const y of [0.25, h * 0.75]) {
				const p = at(x, y, z);
				const r = 0.08;
				const near = boxesNear(
					world,
					[p[0] - r, p[1] - r, p[2] - r],
					[p[0] + r, p[1] + r, p[2] + r]
				);
				if (near.some((box) => sphereVsBox(p, r, box))) return false;
			}
			const foot = at(x, 0, z);
			if (!hasFloor(world, foot, 0.1)) return false;
			if (volumesAt(world, at(x, 0.1, z)).some((v) => v.kind === 'water')) return false;
		}
	}
	return true;
}

/** The middle of a crate, or of a corpse's body: what is looked at to open or search it. */
export function crateCentre(crate: { position: Vec3; kind?: 'corpse' }): Vec3 {
	const height = crate.kind === 'corpse' ? CORPSES.lookHeight : CRATES.size[1] / 2;
	return [crate.position[0], crate.position[1] + height, crate.position[2]];
}
