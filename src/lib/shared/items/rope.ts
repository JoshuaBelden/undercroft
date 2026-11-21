import { ITEMS } from '../../content/items.ts';
import { ANCHOR, PITONS, ROPE } from '../../content/rope.ts';
import {
	floorHeightAt,
	type Anchor,
	type CollisionWorld,
	type RopeLine
} from '../map/collision.ts';
import type { Vec3 } from '../map/types.ts';
import type { ItemStack, PlayerState } from '../player/types.ts';
import { held } from './inventory.ts';
import type { LaidRopeSnapshot, TiedRopeSnapshot } from './types.ts';

/**
 * Rope as gear: what is in the hand, what interact would do with it here (tie it at an anchor,
 * untie one, gather up a laid rope), and the climbable line a tied rope makes. Shared, so the
 * server decides and the client's prompts say the same. See docs/dev/rope.md.
 */

/** The rope pack or bundle in the hand, if that is what is held. */
export function ropeInHand(s: PlayerState): ItemStack | null {
	const stack = held(s.inventory);
	return stack && ITEMS[stack.item]?.rope ? stack : null;
}

/** Metres of rope in a rope pack or bundle. */
export function ropeLength(stack: ItemStack): number {
	return ITEMS[stack.item]?.rope?.length ?? 0;
}

/** Rope it takes to tie at this anchor: the drop and the knot. */
export function ropeNeeded(anchor: Anchor): number {
	return Math.ceil(anchor.top[1] - anchor.bottom + ROPE.knot);
}

/** The line a rope tied at this anchor makes: climbed from the floor below or the ledge above. */
export function tiedRopeLine(anchor: Anchor): RopeLine {
	return {
		id: `tied-${anchor.id}`,
		top: [...anchor.top],
		bottom: anchor.bottom,
		landing: [...anchor.landing],
		knot: [...anchor.knot],
		lip: [...anchor.lip]
	};
}

/** Put the tied ropes into the world's climbable ropes, in place of the ones there were. */
export function applyTied(world: CollisionWorld, tied: readonly TiedRopeSnapshot[]): void {
	const lines = tied.flatMap((t) => {
		const anchor = world.anchors.find((a) => a.id === t.anchor);
		return anchor ? [tiedRopeLine(anchor)] : [];
	});
	world.ropes = [...world.ropes.filter((r) => !r.id.startsWith('tied-')), ...lines];
}

/** Pitons hammered in (sent with the ropes): anchors like the map's, from then on. */
export function applyPitons(world: CollisionWorld, pitons: readonly Anchor[]): void {
	world.anchors = [...world.anchors.filter((a) => !a.id.startsWith('piton-')), ...pitons];
}

/** How far in front of the feet the edge is looked for when a piton goes in (m), and in what steps. */
const EDGE_SEARCH = 1.4;
const EDGE_STEP = 0.05;

/**
 * Where a piton would go in for a player standing at `feet` and facing `direction`: an anchor
 * on the edge in front of them (no further than EDGE_SEARCH), of a drop at least PITONS.minDrop deep, away from any other
 * anchor; null if there is no such edge.
 */
export function pitonAnchor(
	world: CollisionWorld,
	feet: Vec3,
	direction: Vec3,
	id: string
): Anchor | null {
	const flat = Math.hypot(direction[0], direction[2]);
	if (flat < 1e-6) return null;
	const out: [number, number] = [direction[0] / flat, direction[2] / flat];
	const [ox, oz] = out;
	// The tie point is on the edge itself, wherever it is in front of them (within EDGE_SEARCH):
	// the last floor before it falls away. Further back, the rope would hang through the ledge.
	let ahead = -1;
	for (let d = EDGE_STEP; d <= EDGE_SEARCH; d += EDGE_STEP) {
		const floor = floorHeightAt(
			world,
			feet[0] + ox * d,
			feet[2] + oz * d,
			feet[1] + 0.4,
			feet[1] - 0.4
		);
		if (floor === null) break;
		ahead = d;
	}
	if (ahead < 0) return null;
	const position: Vec3 = [feet[0] + ox * ahead, feet[1], feet[2] + oz * ahead];
	const here = floorHeightAt(world, position[0], position[2], feet[1] + 0.4, feet[1] - 0.4);
	if (here === null) return null;
	position[1] = here;
	const top: Vec3 = [
		position[0] + ox * ANCHOR.overhang,
		here + ANCHOR.height,
		position[2] + oz * ANCHOR.overhang
	];
	const past = ANCHOR.overhang + 0.25;
	// Just past the lip the floor has to fall away: on a solid block the floor under the block
	// would otherwise read as a drop anywhere on top of it.
	const level = floorHeightAt(
		world,
		position[0] + ox * past,
		position[2] + oz * past,
		here + 0.4,
		here - 0.4
	);
	if (level !== null) return null;
	const below = floorHeightAt(
		world,
		position[0] + ox * past,
		position[2] + oz * past,
		here - 0.5,
		here - ANCHOR.deepest
	);
	if (below === null || here - below < PITONS.minDrop) return null;
	if (
		world.anchors.some(
			(a) =>
				Math.hypot(a.position[0] - position[0], a.position[2] - position[2]) < PITONS.apart &&
				Math.abs(a.position[1] - here) < 1
		)
	) {
		return null;
	}
	return {
		id,
		position,
		top,
		landing: [position[0] - ox * ANCHOR.stand, here, position[2] - oz * ANCHOR.stand],
		knot: [position[0], here + 0.08, position[2]],
		lip: [position[0] + ox * ANCHOR.lip, here, position[2] + oz * ANCHOR.lip],
		bottom: below
	};
}

/** The anchor whose landing the player stands on, if any. */
export function anchorAt(world: CollisionWorld, s: PlayerState): Anchor | null {
	const [x, y, z] = s.position;
	for (const anchor of world.anchors) {
		const [lx, ly, lz] = anchor.landing;
		if (Math.hypot(x - lx, z - lz) <= ANCHOR.reach && Math.abs(y - ly) <= 0.6) return anchor;
	}
	return null;
}

/** The laid rope nearest the player's feet within reach (not one still being laid), if any. */
export function laidRopeNear(
	laid: readonly LaidRopeSnapshot[],
	position: Vec3
): LaidRopeSnapshot | null {
	let best: LaidRopeSnapshot | null = null;
	let bestDistance: number = ROPE.pickupReach;
	for (const rope of laid) {
		if (rope.laying) continue;
		for (const p of rope.points) {
			if (Math.abs(p[1] - position[1]) > 1.2) continue;
			const d = Math.hypot(p[0] - position[0], p[2] - position[2]);
			if (d <= bestDistance) {
				best = rope;
				bestDistance = d;
			}
		}
	}
	return best;
}

/** What holding interact would do with rope here. */
export type RopeAction =
	| { kind: 'tie'; anchor: Anchor; need: number }
	/** At an anchor with rope in hand, but not enough of it. */
	| { kind: 'short'; anchor: Anchor; need: number }
	| { kind: 'untie'; anchor: Anchor; tied: TiedRopeSnapshot }
	| { kind: 'gather'; rope: LaidRopeSnapshot };

export function ropeAction(
	world: CollisionWorld,
	laid: readonly LaidRopeSnapshot[],
	tied: readonly TiedRopeSnapshot[],
	s: PlayerState
): RopeAction | null {
	const anchor = anchorAt(world, s);
	if (anchor) {
		const here = tied.find((t) => t.anchor === anchor.id);
		if (here) return { kind: 'untie', anchor, tied: here };
		const rope = ropeInHand(s);
		if (rope) {
			const need = ropeNeeded(anchor);
			if (ropeLength(rope) < need) return { kind: 'short', anchor, need };
			return { kind: 'tie', anchor, need };
		}
	}
	const near = laidRopeNear(laid, s.position);
	return near ? { kind: 'gather', rope: near } : null;
}

/** Metres of rope laid so far. */
export function laidLength(rope: LaidRopeSnapshot): number {
	return (rope.points.length - 1) * ROPE.spacing;
}
