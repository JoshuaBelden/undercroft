import { DEFAULT_HEADLAMP, type HeadlampModel } from '../../content/items/headlamps.ts';
import { MOVEMENT, type MovementTuning } from '../../content/player/movement.ts';
import {
	boxesNear,
	capsuleFits,
	capsuleSpheres,
	sphereVsBox,
	type CollisionWorld
} from '../map/collision.ts';
import type { Vec3 } from '../map/types.ts';
import type { InputFrame, PlayerState, Stance } from './types.ts';

/**
 * The player simulation. A pure, fixed-step function run by the server (authoritative) and by
 * the client for prediction; both must produce the same result from the same inputs.
 * See docs/dev/player.md.
 */

const GROUND_NORMAL = 0.7;
const STICK_SPEED = -4;
const MAX_PITCH = 1.5;
/** How far onto a ledge a step-up moves the player (must be <= the radius stepUp checks). */
const STEP_FORWARD = 0.15;

export function createPlayerState(position: Vec3, yaw: number): PlayerState {
	return {
		position: [...position],
		velocity: [0, 0, 0],
		yaw,
		pitch: 0,
		stance: 'stand',
		grounded: false,
		stamina: MOVEMENT.stamina.max,
		exhausted: false,
		staminaDelay: 0,
		headlamp: 1,
		battery: 1,
		lampClock: 0,
		flags: { noclip: false, infiniteStamina: false, infiniteBattery: false }
	};
}

export function clonePlayerState(s: PlayerState): PlayerState {
	return {
		...s,
		position: [...s.position],
		velocity: [...s.velocity],
		flags: { ...s.flags }
	};
}

/** An input frame with no movement, keeping the current look and modes. */
export function idleFrame(seq: number, s: PlayerState): InputFrame {
	return {
		seq,
		moveX: 0,
		moveZ: 0,
		yaw: s.yaw,
		pitch: s.pitch,
		sprint: false,
		stance: s.stance,
		headlamp: s.headlamp
	};
}

/** Clamp untrusted input (from the network) into valid ranges. */
export function sanitizeFrame(raw: unknown): InputFrame | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const f = raw as Record<string, unknown>;
	const num = (v: unknown, lo: number, hi: number) =>
		typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0;
	if (typeof f.seq !== 'number' || !Number.isInteger(f.seq)) return null;
	const stance: Stance = f.stance === 'crouch' || f.stance === 'crawl' ? f.stance : 'stand';
	const lamp = f.headlamp === 1 || f.headlamp === 2 ? f.headlamp : 0;
	return {
		seq: f.seq,
		moveX: num(f.moveX, -1, 1),
		moveZ: num(f.moveZ, -1, 1),
		yaw: num(f.yaw, -1e6, 1e6),
		pitch: num(f.pitch, -MAX_PITCH, MAX_PITCH),
		sprint: f.sprint === true,
		stance,
		headlamp: lamp
	};
}

/** Advance `s` by one fixed step. Mutates and returns `s`. */
export function stepPlayer(
	s: PlayerState,
	input: InputFrame,
	world: CollisionWorld,
	dt: number,
	t: MovementTuning = MOVEMENT,
	lamp: HeadlampModel = DEFAULT_HEADLAMP
): PlayerState {
	s.yaw = input.yaw;
	s.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, input.pitch));
	changeStance(s, input.stance, world, t);
	s.headlamp = input.headlamp;

	const sin = Math.sin(s.yaw);
	const cos = Math.cos(s.yaw);
	// Forward is -Z at yaw 0; right is +X.
	let wx = cos * input.moveX - sin * input.moveZ;
	let wz = -sin * input.moveX - cos * input.moveZ;
	const wishLen = Math.hypot(wx, wz);
	if (wishLen > 1) {
		wx /= wishLen;
		wz /= wishLen;
	}
	const moving = wishLen > 0.01;
	const sprinting =
		input.sprint && moving && input.moveZ > 0 && s.stance === 'stand' && !s.exhausted;

	if (s.flags.noclip) {
		const speed = t.noclipSpeed * (input.sprint ? 2 : 1);
		const cp = Math.cos(s.pitch);
		const fx = -sin * cp;
		const fy = Math.sin(s.pitch);
		const fz = -cos * cp;
		s.position[0] += (cos * input.moveX + fx * input.moveZ) * speed * dt;
		s.position[1] += fy * input.moveZ * speed * dt;
		s.position[2] += (-sin * input.moveX + fz * input.moveZ) * speed * dt;
		s.velocity = [0, 0, 0];
		s.grounded = false;
	} else {
		const speed = sprinting ? t.sprintSpeed : t.stances[s.stance].speed;
		const accel = Math.min(1, (s.grounded ? t.acceleration : t.airAcceleration) * dt);
		s.velocity[0] += (wx * speed - s.velocity[0]) * accel;
		s.velocity[2] += (wz * speed - s.velocity[2]) * accel;
		s.velocity[1] = s.grounded ? STICK_SPEED : s.velocity[1] - t.gravity * dt;
		for (let i = 0; i < 3; i++) s.position[i] += s.velocity[i] * dt;
		resolveCollisions(s, world, t);
	}

	updateStamina(s, sprinting, dt, t);
	updateBattery(s, dt, lamp);
	return s;
}

function changeStance(
	s: PlayerState,
	wanted: Stance,
	world: CollisionWorld,
	t: MovementTuning
): void {
	if (wanted === s.stance) return;
	const fits = (stance: Stance) =>
		s.flags.noclip ||
		t.stances[stance].height <= t.stances[s.stance].height ||
		capsuleFits(world, s.position, t.stances[stance].height, t.radius);
	if (fits(wanted)) s.stance = wanted;
	// Standing up from a crawl under a low ceiling: get as high as fits.
	else if (wanted === 'stand' && s.stance === 'crawl' && fits('crouch')) s.stance = 'crouch';
}

function resolveCollisions(s: PlayerState, world: CollisionWorld, t: MovementTuning): void {
	const r = t.radius;
	const height = t.stances[s.stance].height;
	const spheres = capsuleSpheres(height, r);
	const wasGrounded = s.grounded;
	const p = s.position;
	const near = boxesNear(
		world,
		[p[0] - r - 0.5, p[1] - 0.5, p[2] - r - 0.5],
		[p[0] + r + 0.5, p[1] + height + 0.5, p[2] + r + 0.5]
	);
	s.grounded = false;

	for (let iteration = 0; iteration < 4; iteration++) {
		let touched = false;
		for (let si = 0; si < spheres.length; si++) {
			for (const box of near) {
				const c = sphereVsBox([p[0], p[1] + spheres[si], p[2]], r, box);
				if (!c) continue;
				touched = true;
				const [nx, ny, nz] = c.normal;
				if (ny > GROUND_NORMAL) {
					// Floor or slope: resolve vertically so we don't slide down ramps.
					p[1] += c.depth / ny;
					s.grounded = true;
					if (s.velocity[1] < 0) s.velocity[1] = 0;
					continue;
				}
				if (ny < -GROUND_NORMAL) {
					for (let i = 0; i < 3; i++) p[i] += c.normal[i] * c.depth;
					if (s.velocity[1] > 0) s.velocity[1] = 0;
					continue;
				}
				// Wall. Low ledges are stepped onto: lift just above the ledge and move onto it
				// (stepUp has checked there is room), then floor resolution settles the feet.
				// Only a ledge in front of us facing back at us can be stepped onto: never an
				// underside (ny < 0) or a face pointing the way we're moving (e.g. the far end of
				// a ramp we're walking off), or the step-up would push us backwards.
				const facingUs = s.velocity[0] * nx + s.velocity[2] * nz < 0;
				const rise =
					si === 0 && ny >= -0.1 && facingUs
						? stepUp(world, p, nx, nz, c.point[1] - p[1], height, t)
						: 0;
				if ((wasGrounded || s.grounded) && rise > 0) {
					const hl = Math.hypot(nx, nz) || 1;
					p[0] -= (nx / hl) * STEP_FORWARD;
					p[1] += rise;
					p[2] -= (nz / hl) * STEP_FORWARD;
					s.grounded = true;
					continue;
				}
				const len = Math.hypot(nx, nz) || 1;
				p[0] += (nx / len) * c.depth;
				p[2] += (nz / len) * c.depth;
				const into = (s.velocity[0] * nx + s.velocity[2] * nz) / len;
				if (into < 0) {
					s.velocity[0] -= (nx / len) * into;
					s.velocity[2] -= (nz / len) * into;
				}
			}
		}
		if (!touched) break;
	}

	// Ground probe: resting exactly on a floor produces no penetration, so look slightly below.
	if (!s.grounded) {
		for (const box of near) {
			const c = sphereVsBox([p[0], p[1] + r - 0.06, p[2]], r, box);
			if (c && c.normal[1] > GROUND_NORMAL) {
				s.grounded = true;
				break;
			}
		}
	}
}

/**
 * Height to lift onto a low ledge in front of the player, or 0 if it's a wall. The capsule must
 * fit a little way onto the ledge at full step height; then the lowest height that fits is found.
 */
function stepUp(
	world: CollisionWorld,
	p: Vec3,
	nx: number,
	nz: number,
	contactRise: number,
	height: number,
	t: MovementTuning
): number {
	if (contactRise <= 0.02 || contactRise > t.stepHeight) return 0;
	const hl = Math.hypot(nx, nz) || 1;
	const x = p[0] - (nx / hl) * t.radius;
	const z = p[2] - (nz / hl) * t.radius;
	if (!capsuleFits(world, [x, p[1] + t.stepHeight + 0.01, z], height, t.radius)) return 0;
	let lo = 0;
	let hi = t.stepHeight + 0.01;
	for (let i = 0; i < 6; i++) {
		const mid = (lo + hi) / 2;
		if (capsuleFits(world, [x, p[1] + mid, z], height, t.radius)) hi = mid;
		else lo = mid;
	}
	// capsuleFits tolerates tiny overlaps; clear the ledge so the feet land on top of it.
	return Math.min(hi + 0.04, t.stepHeight + 0.04);
}

function updateStamina(s: PlayerState, sprinting: boolean, dt: number, t: MovementTuning): void {
	const st = t.stamina;
	if (sprinting) {
		if (!s.flags.infiniteStamina) s.stamina -= st.sprintDrain * dt;
		s.staminaDelay = st.regenDelay;
		if (s.stamina <= 0) {
			s.stamina = 0;
			s.exhausted = true;
		}
	} else if (s.staminaDelay > 0) {
		s.staminaDelay = Math.max(0, s.staminaDelay - dt);
	} else {
		s.stamina = Math.min(st.max, s.stamina + st.regen * dt);
	}
	if (s.exhausted && s.stamina >= st.max * st.recoverAt) s.exhausted = false;
}

function updateBattery(s: PlayerState, dt: number, lamp: HeadlampModel): void {
	const mode = s.headlamp ? lamp.modes[s.headlamp] : null;
	if (!mode || s.battery <= 0) return;
	s.lampClock += dt;
	if (!s.flags.infiniteBattery) s.battery = Math.max(0, s.battery - mode.drain * dt);
}
