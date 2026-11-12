import { PICKUP } from '../../content/items.ts';
import { segmentHit, type CollisionWorld } from '../map/collision.ts';
import { crateCentre } from '../map/crates.ts';
import type { Vec3 } from '../map/types.ts';

/**
 * Which item on the floor a player is looking at (within reach, in view, not behind a wall).
 * Items right at your feet count even if you aren't looking straight at them. Shared so the
 * client highlights exactly what the server will pick up. See docs/dev/items.md.
 */
export function lookedAtItem<T extends { position: Vec3 }>(
	world: CollisionWorld,
	feet: Vec3,
	eye: Vec3,
	look: Vec3,
	items: Iterable<T>
): T | null {
	let best: T | null = null;
	let bestScore = Infinity;
	for (const item of items) {
		const target: Vec3 = [item.position[0], item.position[1] + 0.1, item.position[2]];
		const to: Vec3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
		const d = Math.hypot(to[0], to[1], to[2]);
		if (d > PICKUP.range) continue;
		const along = (to[0] * look[0] + to[1] * look[1] + to[2] * look[2]) / Math.max(d, 1e-6);
		const angle = Math.acos(Math.min(1, Math.max(-1, along)));
		const atFeet = Math.hypot(item.position[0] - feet[0], item.position[2] - feet[2]) < 0.6;
		if (angle > PICKUP.angle && !atFeet) continue;
		if (segmentHit(world, eye, target) !== null) continue;
		const score = angle + d * 0.1;
		if (score < bestScore) {
			best = item;
			bestScore = score;
		}
	}
	return best;
}

/** How directly a crate must be looked at (radians from its middle), and how near to stay. */
export const CRATE_REACH = { angle: 0.5, leave: PICKUP.range + 0.75 };

/**
 * Which loot crate a player is looking at within reach. Shared so the client prompts for exactly
 * the crate the server will open. A floor item being looked at comes first: check that before.
 */
export function lookedAtCrate<T extends { position: Vec3 }>(
	world: CollisionWorld,
	eye: Vec3,
	look: Vec3,
	crates: Iterable<T>
): T | null {
	let best: T | null = null;
	let bestScore = Infinity;
	for (const crate of crates) {
		const target = crateCentre(crate);
		const to: Vec3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
		const d = Math.hypot(to[0], to[1], to[2]);
		if (d > PICKUP.range) continue;
		const along = (to[0] * look[0] + to[1] * look[1] + to[2] * look[2]) / Math.max(d, 1e-6);
		const angle = Math.acos(Math.min(1, Math.max(-1, along)));
		if (angle > CRATE_REACH.angle) continue;
		// The crate is solid, so the line to its middle always ends on something: it has to be
		// the crate itself, not a wall in front of it.
		const t = segmentHit(world, eye, target);
		if (t !== null && (1 - t) * d > 0.7) continue;
		const score = angle + d * 0.1;
		if (score < bestScore) {
			best = crate;
			bestScore = score;
		}
	}
	return best;
}
