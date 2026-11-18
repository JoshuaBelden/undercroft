import { ITEMS } from '../../content/items.ts';
import { SANITY, TEND } from '../../content/player/sanity.ts';
import { held } from '../items/inventory.ts';
import { rayVsCapsule, segmentHit, type CollisionWorld } from '../map/collision.ts';
import type { Vec3 } from '../map/types.ts';
import { bodyHeight } from './simulate.ts';
import type { PlayerState } from './types.ts';

/**
 * Using what is in your hand on a teammate (#96): a bandage or medkit on one who is hurt, a
 * battery in the lamp of one whose lamp isn't full. Hold aim (right click, LT) while looking at
 * them, standing still. Counted in the shared step like bandaging yourself, so it is predicted;
 * the server gives them what it does. See docs/dev/items.md#using-items-on-a-teammate.
 */

/** A teammate as the step sees them: where they stand, and what they could use. */
export interface TeammateSpot {
	id: string;
	/** Feet. */
	position: Vec3;
	/** Body height (m), for what there is of them to look at. */
	height: number;
	/** Sanity below full: a bandage would help. */
	hurt: boolean;
	/** Lamp battery below full: a battery would help. */
	lampLow: boolean;
}

/** A teammate on their feet as a spot (null when they are down, dead or gone). */
export function teammateSpot(id: string, s: PlayerState): TeammateSpot | null {
	if (s.downed || s.dead || s.extracted) return null;
	return {
		id,
		position: [...s.position],
		height: bodyHeight(s),
		hurt: s.sanity < SANITY.max,
		lampLow: s.battery < 1
	};
}

/** What the item in the hand does for someone else: heals them, or charges their lamp. */
export type TendKind = 'heal' | 'charge';

export function tendKind(s: PlayerState): TendKind | null {
	const stack = held(s.inventory);
	const def = stack ? ITEMS[stack.item] : undefined;
	if (def?.heal) return 'heal';
	if (def?.charge) return 'charge';
	return null;
}

/** Whether the teammate could use what this kind of item does. */
export function needs(spot: TeammateSpot, kind: TendKind): boolean {
	return kind === 'heal' ? spot.hurt : spot.lampLow;
}

/**
 * The teammate the player is looking at within reach, nearest first, with nothing in the way.
 * Shared so the client prompts for exactly whom the server will tend.
 */
export function lookedAtTeammate(
	world: CollisionWorld,
	eye: Vec3,
	look: Vec3,
	spots: Iterable<TeammateSpot>
): TeammateSpot | null {
	let best: TeammateSpot | null = null;
	let bestDistance = Infinity;
	for (const spot of spots) {
		const d = rayVsCapsule(eye, look, TEND.range, spot.position, spot.height, TEND.radius);
		if (d === null || d >= bestDistance) continue;
		const hit: Vec3 = [eye[0] + look[0] * d, eye[1] + look[1] * d, eye[2] + look[2] * d];
		if (segmentHit(world, eye, hit) !== null) continue;
		best = spot;
		bestDistance = d;
	}
	return best;
}
