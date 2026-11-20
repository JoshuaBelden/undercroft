import type { ItemDef } from '../../content/items.ts';
import { SIM_RATE } from '../constants.ts';
import { segmentHit, type CollisionWorld } from '../map/collision.ts';
import type { Vec3 } from '../map/types.ts';

/**
 * Things in flight: thrown items and slow rounds (a crossbow's bolt, a slingshot's pebble). The
 * server flies them (server/items.ts), and the client draws where a throw will land with the same
 * steps (`flightPath`), so the mark is where it comes down. See docs/dev/combat.md.
 */

export const FLIGHT = {
	/** m/s², pulling everything in flight down. */
	gravity: 9.8,
	/** A throw is lobbed: this much extra upward speed (m/s) on top of where it is aimed. */
	lift: 1.5,
	/** Things leave the hand this far in front of the eye (m). */
	ahead: 0.3,
	/** Simulated steps a second (the player simulation's rate). */
	rate: SIM_RATE,
	/** Most seconds a path is followed (the preview); a throw is down long before. */
	longest: 4
};

/** How something leaves the hand: where, and how fast which way. */
export function launch(
	origin: Vec3,
	direction: Vec3,
	speed: number,
	lift: number
): { position: Vec3; velocity: Vec3 } {
	return {
		position: [
			origin[0] + direction[0] * FLIGHT.ahead,
			origin[1] + direction[1] * FLIGHT.ahead,
			origin[2] + direction[2] * FLIGHT.ahead
		],
		velocity: [direction[0] * speed, direction[1] * speed + lift, direction[2] * speed]
	};
}

/** How a held item flies when let go: a throwable's speed and lob, or null. */
export function throwOf(def: ItemDef | undefined): { speed: number; lift: number } | null {
	return def?.throwable ? { speed: def.throwable.speed, lift: FLIGHT.lift } : null;
}

/**
 * One step of flight: gravity, then the move. Returns where it would be, and the fraction of the
 * move at which it hit the world (null if it didn't).
 */
export function flightStep(
	world: CollisionWorld,
	position: Vec3,
	velocity: Vec3,
	dt: number
): { next: Vec3; hit: number | null } {
	velocity[1] -= FLIGHT.gravity * dt;
	const next: Vec3 = [
		position[0] + velocity[0] * dt,
		position[1] + velocity[1] * dt,
		position[2] + velocity[2] * dt
	];
	return { next, hit: segmentHit(world, position, next) };
}

/** Where it comes to rest from a hit at fraction `t` of a step: backed off the surface a little. */
export function restingAt(from: Vec3, to: Vec3, t: number): Vec3 {
	const k = Math.max(0, t - 0.05);
	return [
		from[0] + (to[0] - from[0]) * k,
		from[1] + (to[1] - from[1]) * k,
		from[2] + (to[2] - from[2]) * k
	];
}

/**
 * The whole flight of something launched from `origin` along `direction` (no creatures: the
 * preview): its points, every `every` steps, and where it lands (null if it never does in
 * `FLIGHT.longest` seconds).
 */
export function flightPath(
	world: CollisionWorld,
	origin: Vec3,
	direction: Vec3,
	speed: number,
	lift: number,
	every = 3
): { points: Vec3[]; landing: Vec3 | null } {
	const { position, velocity } = launch(origin, direction, speed, lift);
	const dt = 1 / FLIGHT.rate;
	const points: Vec3[] = [[...position]];
	let at = position;
	for (let i = 0; i < FLIGHT.longest * FLIGHT.rate; i++) {
		const { next, hit } = flightStep(world, at, velocity, dt);
		if (hit !== null) {
			const landing = restingAt(at, next, hit);
			points.push(landing);
			return { points, landing };
		}
		at = next;
		if (i % every === every - 1) points.push([...at]);
	}
	return { points, landing: null };
}
