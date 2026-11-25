import { CORPSES, CRATES, TRUNKS } from '../../content/loot.ts';
import { LOOTABLES, type LootableId } from '../../content/lootables.ts';
import { MAP_KIT } from '../../content/map/kit.ts';
import { lootableCentre, lootableOf, openable } from '../items/lootables.ts';
import { Rng } from '../rng.ts';
import { boxesNear, buildCollisionWorld, hasFloor, sphereVsBox, volumesAt } from './collision.ts';
import type { CollisionWorld } from './collision.ts';
import { toWorld } from './grid.ts';
import { spawnPoint } from './points.ts';
import type { CratePlacement, MapKit, MapLayout, PieceDef, Vec3 } from './types.ts';

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** How deep a crate is, out from the wall: other lootables are pushed out by the difference. */
const CRATE_DEPTH = LOOTABLES.crate.size[2];

/**
 * Where the map's lootables stand: which of its crate and lootable markers (`crate-*` and
 * `lootable-<type>-*` empties in the pieces) have something, and what. Seeded by the map seed.
 * The server calls this once the layout is generated and puts the result in `layout.crates`;
 * from there the solid ones are part of the collision world on both sides. Markers in the start
 * room are always left empty. See docs/dev/lootables.md.
 *
 * 1. Every crate marker is filled with probability `CRATES.fill`, every lootable marker with
 *    `CRATES.lootableFill` (rolled for each, so one more or less doesn't reshuffle the rest). A
 *    lootable marker holds its own kind (none if nothing can open it yet); a crate marker a crate.
 * 2. About `CORPSES.share` of the crates become corpses, where a body fits: the dead lie anywhere.
 * 3. On `TRUNKS.tiers`, about `TRUNKS.chance` of the crates left become locked trunks.
 * 4. A crate left in a piece whose kit entry lists `lootables` (until the piece has lootable
 *    markers of its own) holds one of those instead, by weight, where it fits. Kinds nothing can
 *    open yet are left out.
 */
export function placeCrates(
	layout: MapLayout,
	pieces: Record<string, PieceDef>,
	seed: number,
	kit: MapKit = MAP_KIT
): CratePlacement[] {
	const rng = new Rng(seed ^ 0xc4a7e);
	// What the crate markers of a room hold: its own stream, so the filling doesn't change with it.
	const mixes = new Rng(seed ^ 0x3e1ec7);
	const start = spawnPoint(layout, pieces).position;
	const crates: CratePlacement[] = [];
	/** What each crate of a room with a mix would rather be (step 4). */
	const wanted = new Map<CratePlacement, Exclude<LootableId, 'crate'>>();
	// Walls only: things are checked one by one, as they turn into something else.
	const world = buildCollisionWorld({ ...layout, crates: [] }, pieces);
	for (const placement of layout.placements) {
		const piece = pieces[placement.piece];
		const markers = [
			...(piece?.crates ?? []).map((marker) => ({ ...marker, type: undefined })),
			...(piece?.lootables ?? [])
		];
		const mix = Object.entries(kit[placement.piece]?.lootables ?? {}).filter(
			([type, weight]) => (weight ?? 0) > 0 && openable(LOOTABLES[type as LootableId])
		) as [LootableId, number][];
		for (const marker of markers) {
			const filled = rng.next() < (marker.type ? CRATES.lootableFill : CRATES.fill);
			const position = toWorld(placement, marker.position);
			const away = Math.hypot(position[0] - start[0], position[2] - start[2]);
			const atStart = placement === layout.placements[0];
			// Rolled for every crate marker of a room with a mix, filled or not, for the same reason.
			const picked =
				!marker.type && mix.length
					? mixes.weighted<[LootableId, number]>(mix, ([, weight]) => weight)[0]
					: 'crate';
			if (atStart || !filled || away < CRATES.minDistance) continue;
			// A kind nothing in the game can open yet (an offering box, until there are lockpicks).
			if (marker.type && !openable(LOOTABLES[marker.type])) continue;
			const crate: CratePlacement = {
				id: `c${crates.length + 1}`,
				position: position.map(round) as Vec3,
				yaw: round(marker.yaw + (placement.rotation * Math.PI) / 2),
				tier: placement.tier,
				piece: placement.piece
			};
			// A marker of its own kind stands at that lootable's centre already.
			if (marker.type && marker.type !== 'crate') crate.kind = marker.type;
			else if (!marker.type && picked !== 'crate') wanted.set(crate, picked);
			crates.push(crate);
		}
	}

	// Corpses: their own stream, so which markers have crates doesn't change with them.
	const bodies = new Rng(seed ^ 0xc0b5e);
	const plain = crates.filter((crate) => !crate.kind);
	const want = Math.round(plain.length * CORPSES.share);
	let turned = 0;
	for (const crate of bodies.shuffle([...plain])) {
		if (turned >= want) break;
		if (!turn(crate, 'corpse', world, crates)) continue;
		// Either way round: the footprint is the same.
		crate.yaw = round(crate.yaw + (bodies.next() < 0.5 ? 0 : Math.PI));
		turned++;
	}

	// Locked trunks on the deepest level: their own stream too. A trunk is deeper than a crate, so
	// it is pushed out from the wall by the difference to keep its back where the crate's was.
	const locks = new Rng(seed ^ 0x7c0ffe);
	for (const crate of crates) {
		if (crate.kind || !TRUNKS.tiers.includes(crate.tier) || locks.next() >= TRUNKS.chance) continue;
		push(crate, 'trunk');
		crate.kind = 'trunk';
	}

	// What the rest of each room's crates hold, where it fits (else it stays a crate).
	for (const [crate, type] of wanted) if (!crate.kind) turn(crate, type, world, crates);
	return crates;
}

/**
 * A fixed map's lootables (docs/dev/fixed-map.md): one at every crate and lootable marker its
 * rooms have, as placed by hand. Nothing is rolled away, turned into another kind or kept from the
 * start (the generator's placeCrates did all three); a lootable no tool opens yet still has none.
 * A marker's `holds` goes with its crate: what it always holds (the Storeroom's key).
 */
export function roomCrates(layout: MapLayout, pieces: Record<string, PieceDef>): CratePlacement[] {
	const crates: CratePlacement[] = [];
	for (const placement of layout.placements) {
		const piece = pieces[placement.piece];
		const markers = [
			...(piece?.crates ?? []).map((marker) => ({ ...marker, type: undefined, holds: undefined })),
			...(piece?.lootables ?? [])
		];
		for (const marker of markers) {
			if (marker.type && !openable(LOOTABLES[marker.type])) continue;
			crates.push({
				id: `c${crates.length + 1}`,
				position: toWorld(placement, marker.position).map(round) as Vec3,
				yaw: round(marker.yaw + (placement.rotation * Math.PI) / 2),
				tier: placement.tier,
				piece: placement.piece,
				...(marker.type && marker.type !== 'crate' ? { kind: marker.type } : {}),
				...(marker.holds ? { holds: marker.holds } : {})
			});
		}
	}
	return crates;
}

/** Move a crate out from its wall by the difference in depth, for a lootable of this kind. */
function push(crate: CratePlacement, type: LootableId): void {
	const out = LOOTABLES[type].size[2] / 2 - CRATE_DEPTH / 2;
	crate.position = [
		round(crate.position[0] + Math.sin(crate.yaw) * out),
		crate.position[1],
		round(crate.position[2] + Math.cos(crate.yaw) * out)
	];
}

/**
 * Turn a crate into a lootable of another kind, with its back where the crate's was, if that
 * fits there: clear of walls and the rest, on dry floor all over. Returns whether it did.
 */
function turn(
	crate: CratePlacement,
	type: Exclude<LootableId, 'crate'>,
	world: CollisionWorld,
	all: CratePlacement[]
): boolean {
	const size = LOOTABLES[type].size;
	const out = size[2] / 2 - CRATE_DEPTH / 2;
	const centre: Vec3 = [
		crate.position[0] + Math.sin(crate.yaw) * out,
		crate.position[1],
		crate.position[2] + Math.cos(crate.yaw) * out
	];
	const others = all.filter((other) => other !== crate);
	if (others.some((other) => crowds(other, centre, crate.yaw, size))) return false;
	if (!fits(world, centre, crate.yaw, size, LOOTABLES[type].wet)) return false;
	crate.position = centre.map(round) as Vec3;
	crate.kind = type;
	return true;
}

/**
 * True when `other` is too close to a lootable of `size` at `centre`, turned to `yaw`: inside its
 * footprint grown by half the other's own width.
 */
function crowds(other: CratePlacement, centre: Vec3, yaw: number, size: Vec3): boolean {
	const dx = other.position[0] - centre[0];
	const dz = other.position[2] - centre[2];
	if (Math.abs(other.position[1] - centre[1]) > 1) return false;
	const [ow, , od] = lootableOf(other).size;
	// Into this one's own frame (the inverse of its turn).
	const x = dx * Math.cos(yaw) - dz * Math.sin(yaw);
	const z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
	const pad = Math.min(ow, od) / 2;
	return Math.abs(x) < size[0] / 2 + pad && Math.abs(z) < size[2] / 2 + pad;
}

/**
 * True when a lootable of `size` at `centre` (floor level), turned to `yaw`, touches no wall,
 * crate or column, stands on floor all over and is out of the water (unless it is `wet`).
 */
function fits(world: CollisionWorld, centre: Vec3, yaw: number, size: Vec3, wet = false): boolean {
	const [w, h, d] = size;
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	const at = (x: number, y: number, z: number): Vec3 => [
		centre[0] + x * cos + z * sin,
		centre[1] + y,
		centre[2] - x * sin + z * cos
	];
	// Its back lies on the wall line where a crate's would (and a sprawled body doesn't fill the
	// corners of its box): test a little inside the edges.
	const inset = CORPSES.inset;
	const step = 0.25;
	for (let x = -w / 2 + inset; x <= w / 2 - inset + 1e-6; x += step) {
		for (let z = -d / 2 + inset; z <= d / 2 - inset + 1e-6; z += step) {
			for (const y of [Math.min(0.25, h / 2), h * 0.75]) {
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
			if (!wet && volumesAt(world, at(x, 0.1, z)).some((v) => v.kind === 'water')) return false;
		}
	}
	return true;
}

/** The middle of a lootable: what is looked at to open or search it. */
export const crateCentre = lootableCentre;

/** Whether a lootable of this kind fits at a place in a world (a test of the pieces' markers). */
export function lootableFits(
	world: CollisionWorld,
	position: Vec3,
	yaw: number,
	type: LootableId
): boolean {
	return fits(world, position, yaw, LOOTABLES[type].size, LOOTABLES[type].wet);
}
