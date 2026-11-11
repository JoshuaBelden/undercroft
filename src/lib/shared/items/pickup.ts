import { PICKUP } from '../../content/items.ts';
import { segmentHit, type CollisionWorld } from '../map/collision.ts';
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
