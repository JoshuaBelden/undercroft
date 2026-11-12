import { EXPEDITION } from '../../content/expedition.ts';
import { SANITY } from '../../content/player/sanity.ts';
import { DEFAULT_HEADLAMP, type HeadlampModel } from '../../content/items/headlamps.ts';
import { MOVEMENT, type MovementTuning } from '../../content/player/movement.ts';
import {
	boxesNear,
	capsuleFits,
	capsuleSpheres,
	findMantle,
	sphereVsBox,
	volumesAt,
	waterSurface,
	type CollisionWorld
} from '../map/collision.ts';
import { ITEMS } from '../../content/items.ts';
import {
	cloneInventory,
	emptyInventory,
	held,
	speedFactor,
	spendHeld
} from '../items/inventory.ts';
import { idleWeapon, stepWeapon } from '../items/weapons.ts';
import type { Vec3 } from '../map/types.ts';
import type { InputFrame, Inventory, PlayerState, SimEvent, Stance } from './types.ts';

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

export function createPlayerState(
	position: Vec3,
	yaw: number,
	inventory: Inventory = emptyInventory()
): PlayerState {
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
		gloom: 0,
		flags: {
			noclip: false,
			infiniteStamina: false,
			infiniteBattery: false,
			godMode: false,
			infiniteAmmo: false
		},
		swimming: false,
		wading: false,
		underwater: false,
		sneaking: false,
		squeezing: false,
		mantle: null,
		extracting: 0,
		extracted: false,
		sanity: SANITY.max,
		downed: false,
		downedTime: 0,
		surrendering: 0,
		dead: false,
		inventory,
		weapon: idleWeapon(),
		bandaging: 0,
		reviving: 0,
		performing: 0,
		opening: 0
	};
}

export function clonePlayerState(s: PlayerState): PlayerState {
	return {
		...s,
		position: [...s.position],
		velocity: [...s.velocity],
		flags: { ...s.flags },
		mantle: s.mantle ? { ...s.mantle, from: [...s.mantle.from], to: [...s.mantle.to] } : null,
		inventory: cloneInventory(s.inventory),
		weapon: { ...s.weapon, prev: { ...s.weapon.prev } }
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
		sneak: false,
		climb: false,
		swimDown: false,
		interact: false,
		attack: false,
		aim: false,
		reload: false,
		drop: false,
		select: -1,
		stance: s.stance,
		headlamp: s.headlamp
	};
}

/** Capsule height for the current state (swimming bodies are horizontal and short). */
export function bodyHeight(s: PlayerState, t: MovementTuning = MOVEMENT): number {
	return s.swimming ? t.swim.height : t.stances[s.stance].height;
}

/** Camera height above the feet. */
export function eyeHeight(s: PlayerState, t: MovementTuning = MOVEMENT): number {
	return s.swimming ? t.swim.eye : t.stances[s.stance].eye;
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
		sneak: f.sneak === true,
		climb: f.climb === true,
		swimDown: f.swimDown === true,
		interact: f.interact === true,
		attack: f.attack === true,
		aim: f.aim === true,
		reload: f.reload === true,
		drop: f.drop === true,
		select: typeof f.select === 'number' && Number.isInteger(f.select) ? f.select : -1,
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
	lamp: HeadlampModel = DEFAULT_HEADLAMP,
	/** Collects what happened this step (shots, swings...); the server resolves them. */
	events?: SimEvent[]
): PlayerState {
	s.yaw = input.yaw;
	s.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, input.pitch));
	s.headlamp = input.headlamp;
	s.sneaking = input.sneak && !s.swimming;

	if (s.dead) return s;
	if (s.downed) {
		stepWeapon(s, input, dt, false, eyeHeight(s, t), events);
		stepDowned(s, input, world, dt, t);
		updateBattery(s, dt, lamp);
		return s;
	}

	if (s.mantle) {
		advanceMantle(s, dt);
		stepWeapon(s, input, dt, false, eyeHeight(s, t), events);
		s.extracting = 0;
		updateStamina(s, false, false, dt, t);
		updateBattery(s, dt, lamp);
		return s;
	}

	const p = s.position;
	const surface = s.flags.noclip ? null : waterSurface(world, [p[0], p[1] + 0.05, p[2]]);
	updateWater(s, surface, world, t);
	if (!s.swimming) changeStance(s, input.stance, world, t);

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
	s.squeezing =
		!s.swimming &&
		!s.flags.noclip &&
		volumesAt(world, [p[0], p[1] + 0.9, p[2]]).some((v) => v.kind === 'squeeze');
	const sprinting =
		!s.squeezing &&
		input.sprint &&
		!input.sneak &&
		moving &&
		input.moveZ > 0 &&
		(s.stance === 'stand' || s.swimming) &&
		!s.exhausted &&
		!s.weapon.aiming;

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
	} else if (s.swimming && surface !== null) {
		swim(s, input, world, dt, t, surface, sprinting);
	} else {
		let speed = sprinting ? t.sprintSpeed : t.stances[s.stance].speed;
		if (s.weapon.aiming) speed = Math.min(speed, t.aimSpeed);
		if (input.sneak) speed = Math.min(speed, t.sneakSpeed);
		if (s.squeezing) speed = Math.min(speed, t.squeezeSpeed);
		if (s.wading) speed *= t.wadeSpeed;
		// A heavy load slows you (see CARRY).
		speed *= speedFactor(s.inventory);
		const accel = Math.min(1, (s.grounded ? t.acceleration : t.airAcceleration) * dt);
		s.velocity[0] += (wx * speed - s.velocity[0]) * accel;
		s.velocity[2] += (wz * speed - s.velocity[2]) * accel;
		if (s.squeezing) {
			// No carrying momentum into a squeeze: clamp to the squeeze speed straight away.
			const h = Math.hypot(s.velocity[0], s.velocity[2]);
			if (h > t.squeezeSpeed) {
				s.velocity[0] *= t.squeezeSpeed / h;
				s.velocity[2] *= t.squeezeSpeed / h;
			}
		}
		s.velocity[1] = s.grounded ? STICK_SPEED : s.velocity[1] - t.gravity * dt;
		for (let i = 0; i < 3; i++) s.position[i] += s.velocity[i] * dt;
		resolveCollisions(s, world, t);
		if (input.climb && (s.grounded || s.wading)) {
			const y = s.position[1];
			tryMantle(s, world, t, y + t.stepHeight, y + t.mantle.maxHeight);
		}
	}

	s.underwater = surface !== null && s.position[1] + eyeHeight(s, t) < surface;
	updateExtraction(s, input, world, moving, dt);
	updateBandage(s, input, moving);
	const able =
		!s.swimming && !s.mantle && s.stance !== 'crawl' && s.bandaging === 0 && s.reviving === 0;
	stepWeapon(s, input, dt, able, eyeHeight(s, t), events);
	const heal = healing(s);
	if (s.bandaging > 0) s.bandaging += dt;
	if (heal && s.bandaging >= heal.seconds) {
		spendHeld(s.inventory);
		s.sanity = Math.min(SANITY.max, s.sanity + heal.amount);
		s.bandaging = 0;
	}
	updateStamina(s, sprinting, s.underwater, dt, t);
	updateBattery(s, dt, lamp);
	return s;
}

/**
 * Downed: on the floor, dragging yourself along slowly (toward help, out of the way). Bleed out
 * after SANITY.bleedOut, or hold climb for SANITY.surrenderSeconds to give up at once.
 */
function stepDowned(
	s: PlayerState,
	input: InputFrame,
	world: CollisionWorld,
	dt: number,
	t: MovementTuning
): void {
	s.stance = 'crawl';
	const sin = Math.sin(s.yaw);
	const cos = Math.cos(s.yaw);
	let wx = cos * input.moveX - sin * input.moveZ;
	let wz = -sin * input.moveX - cos * input.moveZ;
	const wishLen = Math.hypot(wx, wz);
	if (wishLen > 1) {
		wx /= wishLen;
		wz /= wishLen;
	}
	const accel = Math.min(1, (s.grounded ? t.acceleration : t.airAcceleration) * dt);
	s.velocity[0] += (wx * t.downedSpeed - s.velocity[0]) * accel;
	s.velocity[2] += (wz * t.downedSpeed - s.velocity[2]) * accel;
	s.velocity[1] = s.grounded ? STICK_SPEED : s.velocity[1] - t.gravity * dt;
	for (let i = 0; i < 3; i++) s.position[i] += s.velocity[i] * dt;
	resolveCollisions(s, world, t);
	s.extracting = 0;
	s.bandaging = 0;
	s.downedTime += dt;
	// A key held since before going down doesn't count: it has to be let go first.
	if (!input.climb) s.surrendering = 0;
	else if (s.surrendering >= 0) s.surrendering += dt;
	if (s.downedTime >= SANITY.bleedOut || s.surrendering >= SANITY.surrenderSeconds) s.dead = true;
}

/** The healing spec of what is in the hand (a bandage), if it heals. */
export function healing(s: PlayerState): { amount: number; seconds: number } | undefined {
	const stack = held(s.inventory);
	return stack ? ITEMS[stack.item]?.heal : undefined;
}

/**
 * Start or interrupt applying the healing item in the hand: hold attack, standing still, hurt.
 * Taking something else in the hand interrupts it.
 */
function updateBandage(s: PlayerState, input: InputFrame, moving: boolean): void {
	const ready =
		input.attack && !moving && s.grounded && !s.swimming && !!healing(s) && s.sanity < SANITY.max;
	if (!ready) s.bandaging = 0;
	else if (s.bandaging === 0) s.bandaging = 1e-6;
}

/** The extraction point within reach of the player, if any. */
export function nearExtract(world: CollisionWorld, s: PlayerState): Vec3 | null {
	const [x, y, z] = s.position;
	for (const point of world.extracts) {
		if (
			Math.hypot(point[0] - x, point[2] - z) <= EXPEDITION.extractRadius &&
			Math.abs(point[1] - y) <= EXPEDITION.extractHeight
		) {
			return point;
		}
	}
	return null;
}

/** Holding interact, standing still at an extraction point, climbs out after extractSeconds. */
function updateExtraction(
	s: PlayerState,
	input: InputFrame,
	world: CollisionWorld,
	moving: boolean,
	dt: number
): void {
	const ready =
		input.interact &&
		!moving &&
		s.grounded &&
		!s.swimming &&
		!s.flags.noclip &&
		nearExtract(world, s) !== null;
	s.extracting = ready ? s.extracting + dt : 0;
	if (s.extracting >= EXPEDITION.extractSeconds) s.extracted = true;
}

/** Enter or leave swimming from the water depth over the feet (with a little hysteresis). */
function updateWater(
	s: PlayerState,
	surface: number | null,
	world: CollisionWorld,
	t: MovementTuning
): void {
	const depth = surface === null ? 0 : surface - s.position[1];
	// Start swimming when the water over the feet is deep. A floating swimmer's feet are near the
	// surface, so only stop when standing on the bottom in shallower water (or out of the water).
	const swimming = s.swimming
		? surface !== null && !(s.grounded && depth < t.swim.depth - 0.25)
		: depth > t.swim.depth;
	if (s.swimming && !swimming) {
		// Climbing out onto steps: take the tallest stance that fits.
		const order: Stance[] = ['stand', 'crouch', 'crawl'];
		s.stance =
			order.find((st) => capsuleFits(world, s.position, t.stances[st].height, t.radius)) ?? 'crawl';
	}
	s.swimming = swimming;
	s.wading = !swimming && depth > 0.15;
}

function swim(
	s: PlayerState,
	input: InputFrame,
	world: CollisionWorld,
	dt: number,
	t: MovementTuning,
	surface: number,
	sprinting: boolean
): void {
	const sw = t.swim;
	const sin = Math.sin(s.yaw);
	const cos = Math.cos(s.yaw);
	const cp = Math.cos(s.pitch);
	const sp = Math.sin(s.pitch);
	// Swim where you look; climb / swimDown add straight up / down.
	let dx = cos * input.moveX - sin * cp * input.moveZ;
	let dy = sp * input.moveZ + (input.climb ? 1 : 0) - (input.swimDown ? 1 : 0);
	let dz = -sin * input.moveX - cos * cp * input.moveZ;
	const len = Math.hypot(dx, dy, dz);
	if (len > 1) {
		dx /= len;
		dy /= len;
		dz /= len;
	}
	const speed = sprinting ? sw.sprintSpeed : sw.speed;
	const accel = Math.min(1, 4 * dt);
	s.velocity[0] += (dx * speed - s.velocity[0]) * accel;
	s.velocity[2] += (dz * speed - s.velocity[2]) * accel;

	// Float with the eye just above the surface unless diving. Out of breath always floats up.
	const floatFeet = surface + sw.floatEye - sw.eye;
	const outOfBreath = s.exhausted || s.stamina <= 0;
	const diving = !outOfBreath && (input.swimDown || (input.moveZ > 0 && s.pitch < -0.35));
	if (diving) {
		s.velocity[1] += (dy * speed - s.velocity[1]) * accel;
	} else {
		const target = (floatFeet - s.position[1]) * sw.buoyancy;
		s.velocity[1] += (target - s.velocity[1]) * Math.min(1, sw.drag * dt);
	}

	for (let i = 0; i < 3; i++) s.position[i] += s.velocity[i] * dt;
	// No swimming up out of the water.
	if (s.position[1] > floatFeet + 0.02) {
		s.position[1] = floatFeet + 0.02;
		if (s.velocity[1] > 0) s.velocity[1] = 0;
	}
	resolveCollisions(s, world, t);

	// At the surface, climb (Space) at an edge pulls you out. Never automatic.
	if (input.climb && s.position[1] > floatFeet - 0.3) {
		tryMantle(s, world, t, surface - 0.2, surface + t.mantle.maxFromWater);
	}
}

function tryMantle(
	s: PlayerState,
	world: CollisionWorld,
	t: MovementTuning,
	minTop: number,
	maxTop: number
): void {
	if (s.exhausted && !s.flags.infiniteStamina) return;
	const order: Stance[] = ['stand', 'crouch', 'crawl'];
	const target = findMantle(
		world,
		s.position,
		s.yaw,
		t.radius,
		t.mantle.reach,
		minTop,
		maxTop,
		order.map((st) => t.stances[st].height)
	);
	if (!target) return;
	s.mantle = {
		from: [...s.position],
		to: target.to,
		t: 0,
		duration: t.mantle.duration,
		stance: order[target.fit]
	};
	s.velocity = [0, 0, 0];
	if (!s.flags.infiniteStamina) s.stamina = Math.max(0, s.stamina - t.mantle.staminaCost);
	s.staminaDelay = t.stamina.regenDelay;
}

/** Follow the climb path: rise first, then move onto the ledge. */
function advanceMantle(s: PlayerState, dt: number): void {
	const m = s.mantle;
	if (!m) return;
	m.t = Math.min(m.duration, m.t + dt);
	const k = m.t / m.duration;
	const ease = (x: number) => x * x * (3 - 2 * x);
	const rise = ease(Math.min(1, k / 0.6));
	const over = ease(Math.max(0, (k - 0.5) / 0.5));
	s.position = [
		m.from[0] + (m.to[0] - m.from[0]) * over,
		m.from[1] + (m.to[1] - m.from[1]) * rise,
		m.from[2] + (m.to[2] - m.from[2]) * over
	];
	if (m.t >= m.duration) {
		s.position = [...m.to];
		s.stance = m.stance;
		s.swimming = false;
		s.wading = false;
		s.underwater = false;
		s.grounded = true;
		s.mantle = null;
	}
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
	const height = bodyHeight(s, t);
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
				// Swimmers step up too, so swimming into submerged steps walks you out of the water.
				if ((wasGrounded || s.grounded || s.swimming) && rise > 0) {
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

function updateStamina(
	s: PlayerState,
	sprinting: boolean,
	underwater: boolean,
	dt: number,
	t: MovementTuning
): void {
	const st = t.stamina;
	if (underwater) {
		// Breath: drains, and nothing comes back until you surface.
		if (!s.flags.infiniteStamina) s.stamina -= t.swim.breathDrain * dt;
		s.staminaDelay = st.regenDelay;
		if (s.stamina <= 0) {
			s.stamina = 0;
			s.exhausted = true;
		}
	} else if (sprinting) {
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
