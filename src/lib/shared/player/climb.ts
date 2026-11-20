import { CLIMB, MOVEMENT, type MovementTuning } from '../../content/player/movement.ts';
import { climbFactor } from '../items/gear.ts';
import type { CollisionWorld, RopeLine } from '../map/collision.ts';
import type { Vec3 } from '../map/types.ts';
import type { InputFrame, PlayerState, SimEvent } from './types.ts';

/**
 * Climbing ropes: grabbing one, going up and down it, stepping off at either end, getting out
 * up an extraction rope, and letting go. Part of the player simulation, so the client predicts
 * it and the server decides. See docs/dev/rope.md.
 */

/** Another player on a rope this step: nobody climbs past them. */
export interface ClimberSpot {
	rope: string;
	/** Their feet (world y). */
	y: number;
}

export function ropeById(world: CollisionWorld, id: string): RopeLine | undefined {
	return world.ropes.find((r) => r.id === id);
}

/** Where on a rope a player standing at `s` would grab it: its id, the feet height and the side. */
export interface Grab {
	rope: RopeLine;
	y: number;
	side: [number, number];
}

function unit(x: number, z: number, yaw: number): [number, number] {
	const len = Math.hypot(x, z);
	// Right at the rope: hang on the side they came from (behind where they look).
	if (len < 1e-4) return [Math.sin(yaw), Math.cos(yaw)];
	return [x / len, z / len];
}

/** Someone else on this rope within CLIMB.gap of feet height `y`. */
function crowded(rope: string, y: number, others: readonly ClimberSpot[]): boolean {
	return others.some((o) => o.rope === rope && Math.abs(o.y - y) < CLIMB.gap);
}

/**
 * The rope a player could grab from where they stand, if any: from the floor at its foot, or
 * from the ledge at its top (a tied rope's landing), facing it (so at a tied rope's post, looking
 * away from the drop leaves interact for untying it). Not when someone is already where they
 * would hang. Nearest first.
 */
export function ropeToGrab(
	world: CollisionWorld,
	s: PlayerState,
	others: readonly ClimberSpot[] = []
): Grab | null {
	const [x, y, z] = s.position;
	let best: Grab | null = null;
	let bestDistance = Infinity;
	for (const rope of world.ropes) {
		const dx = x - rope.top[0];
		const dz = z - rope.top[2];
		const distance = Math.hypot(dx, dz);
		if (distance >= bestDistance) continue;
		// Facing it: within CLIMB.facing of looking straight at it (or right at it).
		const ahead = -Math.sin(s.yaw) * -dx + -Math.cos(s.yaw) * -dz;
		if (distance > 0.2 && ahead / distance < Math.cos(CLIMB.facing)) continue;
		let grab: Grab | null = null;
		// A rope down a drop: always on the far side from the ledge, clear of its face.
		const landing = rope.landing;
		const side = landing
			? unit(rope.top[0] - landing[0], rope.top[2] - landing[2], s.yaw)
			: unit(dx, dz, s.yaw);
		if (
			!rope.hangsFree &&
			Math.abs(y - rope.bottom) <= CLIMB.grabFromFloor &&
			distance <= CLIMB.reach
		) {
			grab = { rope, y: rope.bottom + CLIMB.footClearance * 3, side };
		} else if (
			landing &&
			Math.abs(y - landing[1]) <= CLIMB.grabFromTop &&
			// From the top it is where you stand that counts: on the landing, back from the edge.
			Math.hypot(x - landing[0], z - landing[2]) <= CLIMB.topReach
		) {
			grab = { rope, y: landing[1] - CLIMB.topDrop, side };
		}
		if (!grab || crowded(rope.id, grab.y, others)) continue;
		best = grab;
		bestDistance = distance;
	}
	return best;
}

/** Take hold of a rope: hang beside it at the grab height. */
export function grabRope(s: PlayerState, grab: Grab, events?: SimEvent[]): void {
	s.climbing = { rope: grab.rope.id, side: grab.side };
	s.mantle = null;
	s.stance = 'stand';
	s.position = hangPoint(grab.rope, grab.side, grab.y);
	s.velocity = [0, 0, 0];
	s.grounded = false;
	s.extracting = 0;
	events?.push({ kind: 'grab', rope: grab.rope.id });
}

function hangPoint(rope: RopeLine, side: [number, number], y: number): Vec3 {
	return [rope.top[0] + side[0] * CLIMB.hold, y, rope.top[2] + side[1] * CLIMB.hold];
}

/** Let go (or slip off): from here on it is a fall. */
export function letGo(s: PlayerState, events?: SimEvent[]): void {
	const rope = s.climbing?.rope;
	s.climbing = null;
	s.velocity = [0, 0, 0];
	s.grounded = false;
	if (rope) events?.push({ kind: 'letgo', rope });
}

/**
 * One step on a rope. Push forward to climb up and back to climb down (at any push, scaled);
 * sprint held climbs faster, or slides down. Stance (C / B) lets go. Stamina never comes back on
 * a rope: climbing spends it, hanging still only slowly, and when it runs out the hands give out. At the foot the climber steps
 * off (or, at the end of a rope that hangs free, drops); at the top they climb onto the landing,
 * or out of the catacomb on an extraction rope.
 */
export function stepClimb(
	s: PlayerState,
	input: InputFrame,
	world: CollisionWorld,
	dt: number,
	t: MovementTuning = MOVEMENT,
	others: readonly ClimberSpot[] = [],
	events?: SimEvent[]
): void {
	const climb = s.climbing;
	const rope = climb && ropeById(world, climb.rope);
	if (!climb || !rope) {
		// The rope is gone (untied from above): fall.
		letGo(s, events);
		return;
	}
	const tired = s.exhausted && !s.flags.infiniteStamina;
	if (input.letGo || tired) {
		letGo(s, events);
		return;
	}
	const push = Math.max(-1, Math.min(1, input.moveZ));
	const fast = input.sprint;
	// Gloves take the burn out of it.
	const speed =
		(push > 0
			? push * (fast ? CLIMB.fastUpSpeed : CLIMB.upSpeed)
			: push * (fast ? CLIMB.slideSpeed : CLIMB.downSpeed)) * climbFactor(s.inventory);
	let y = s.position[1] + speed * dt;

	// Nobody climbs past anyone: stop short of the nearest climber above and below. Someone
	// already too close (a late update) blocks moving closer, but never pushes.
	const from = s.position[1];
	for (const o of others) {
		if (o.rope !== rope.id) continue;
		if (o.y >= from) y = Math.min(y, Math.max(from, o.y - CLIMB.gap));
		else y = Math.max(y, Math.min(from, o.y + CLIMB.gap));
	}
	// Hands stay below the top; feet no lower than the foot.
	const highest = rope.top[1] - t.stances.stand.height;
	y = Math.max(rope.bottom, Math.min(y, highest));

	drain(s, push, fast, dt, t);
	s.position = hangPoint(rope, climb.side, y);
	s.velocity = [0, (y - from) / dt, 0];
	s.grounded = false;

	if (rope.exitY !== undefined && y >= rope.exitY) {
		s.extracted = true;
		return;
	}
	if (push < 0 && y <= rope.bottom + CLIMB.footClearance) {
		if (rope.hangsFree) {
			// The end of a rope that doesn't reach the floor: off it, and down.
			letGo(s, events);
			return;
		}
		// Feet on the floor: step off.
		s.position[1] = rope.bottom;
		s.climbing = null;
		s.velocity = [0, 0, 0];
		s.grounded = true;
		return;
	}
	const landing = rope.landing;
	// Up to the ledge (or as high as the rope goes): haul over onto the landing.
	if (push > 0 && landing && y >= Math.min(landing[1] - t.mantle.maxHeight, highest - 0.01)) {
		s.climbing = null;
		s.mantle = { from: [...s.position], to: [...landing], t: 0, duration: 1.1, stance: 'stand' };
		s.velocity = [0, 0, 0];
	}
}

/** Climbing tires you, and hanging there still does, slowly: nothing comes back on a rope. */
function drain(s: PlayerState, push: number, fast: boolean, dt: number, t: MovementTuning): void {
	s.staminaDelay = t.stamina.regenDelay;
	if (s.flags.infiniteStamina) return;
	const up = fast ? CLIMB.fastUpDrain : CLIMB.upDrain;
	const rate = push > 0 ? up * push : push < 0 ? CLIMB.downDrain * -push : CLIMB.hangDrain;
	s.stamina = Math.max(0, s.stamina - rate * dt);
	if (s.stamina <= 0) s.exhausted = true;
}
