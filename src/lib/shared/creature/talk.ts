import { CREATURES } from '../../content/creatures.ts';
import { rayVsCapsule, segmentBlocked, type CollisionWorld } from '../map/collision.ts';
import type { Vec3 } from '../map/types.ts';

/** A friendly creature (the surveyor) as the look-at test sees it. */
export interface Friendly {
	id: string;
	kind: string;
	position: Vec3;
}

/** A body is a little easier to look at than to hit. */
const LOOK_SLACK = 1.5;

/**
 * The friendly creature someone is looking at, within its talking range (`friendly.range`) with
 * nothing in between, or null. The same on the server and the client, so the prompt shows when
 * holding interact would work. See docs/dev/creatures.md#the-surveyor.
 */
export function lookedAtFriendly(
	world: CollisionWorld,
	origin: Vec3,
	direction: Vec3,
	friendlies: Iterable<Friendly>
): Friendly | null {
	let best: Friendly | null = null;
	let bestD = Infinity;
	for (const f of friendlies) {
		const def = CREATURES[f.kind];
		if (!def?.friendly) continue;
		const d = rayVsCapsule(
			origin,
			direction,
			def.friendly.range,
			f.position,
			def.height,
			def.hitRadius * LOOK_SLACK
		);
		if (d === null || d >= bestD) continue;
		const at: Vec3 = [
			origin[0] + direction[0] * d,
			origin[1] + direction[1] * d,
			origin[2] + direction[2] * d
		];
		if (segmentBlocked(world, origin, at)) continue;
		best = f;
		bestD = d;
	}
	return best;
}
