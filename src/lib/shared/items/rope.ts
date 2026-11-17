import { ITEMS } from '../../content/items.ts';
import { ANCHOR, ROPE } from '../../content/rope.ts';
import type { Anchor, CollisionWorld, RopeLine } from '../map/collision.ts';
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
