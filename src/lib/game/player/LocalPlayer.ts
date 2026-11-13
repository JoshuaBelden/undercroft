import { ITEMS } from '#lib/content/items.ts';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import type { InputMap } from '#lib/game/input/InputMap.ts';
import type { GameClient } from '#lib/game/net/GameClient.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { SIM_RATE } from '#lib/shared/constants.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import { held } from '#lib/shared/items/inventory.ts';
import { clonePlayerState, eyeHeight, stepPlayer } from '#lib/shared/player/simulate.ts';
import {
	HAND,
	type HeadlampMode,
	type InputFrame,
	type PlayerSnapshot,
	type PlayerState,
	type SimEvent,
	type Stance
} from '#lib/shared/player/types.ts';
import { DEFAULT_HEADLAMP } from '#lib/content/items/headlamps.ts';

const DT = 1 / SIM_RATE;
/** Radians of look per pixel of mouse movement at sensitivity 1. */
const LOOK_SPEED = 0.0022;
const MAX_PITCH = 1.5;
/** Seconds over which most of a recoil kick lands on the view. */
const KICK_TIME = 0.05;
/** Corrections larger than this snap instead of smoothing (teleports, respawns). */
const SNAP_DISTANCE = 2;
/** Seconds for a prediction correction to blend out. */
const SMOOTHING = 0.1;
/** Stop buffering if the server stops acknowledging (disconnected). */
const MAX_PENDING = SIM_RATE * 3;
const MAX_STEPS_PER_FRAME = 10;
const STANCE_CYCLE: Stance[] = ['stand', 'crouch', 'crawl'];
/** Releasing the stance key within this many ms counts as a tap (cycle stance) rather than a hold (creep). */
const LONG_PRESS_MS = 350;
/** How far (pixels of mouse movement) the quick-use wheel's pointer can go from the centre. */
const WHEEL_REACH = 120;

/**
 * The local player: samples input every fixed step, predicts movement with the shared
 * simulation, sends input frames to the server, and reconciles with server snapshots.
 * See docs/dev/player.md.
 */
export class LocalPlayer {
	/** Predicted state; null until the first snapshot arrives. */
	state: PlayerState | null = null;
	private previous: PlayerState | null = null;
	private world: CollisionWorld | null = null;
	private pending: InputFrame[] = [];
	private outbox: InputFrame[] = [];
	private seq = 0;
	private accumulator = 0;
	private yaw = 0;
	private pitch = 0;
	/** Recoil still to be applied to the view (radians), worked off over a moment. */
	private kickLeft = { pitch: 0, yaw: 0 };
	/** Mouse look is scaled by this: the zoom while aiming, so the view moves as it looks. */
	lookScale = 1;
	/** Wanted stance, cycled by the stance key; the simulation rises only when there is room. */
	private stance: Stance = 'stand';
	private lamp: HeadlampMode = 1;
	/** Creeping (slow, silent walk): true while the stance key is held. */
	private creep = false;
	private stancePressedAt: number | null = null;
	private offset: Vec3 = [0, 0, 0];
	private eye: number = MOVEMENT.stances.stand.eye;
	private unsubscribe: () => void;
	/** What to take in the hand, chosen since the last sim step (sent once), or -1. */
	private select = -1;
	/**
	 * While the quick-use wheel is open: where its pointer is, from the centre (pixels). The mouse
	 * moves the pointer instead of the view.
	 */
	private wheel: { x: number; y: number } | null = null;
	/** What the predicted simulation did since the last `drainEvents` (for instant feedback). */
	private events: SimEvent[] = [];
	/**
	 * Sprint and aim switched on by a press, with the toggle settings (accessibility): instead of
	 * holding the key. Sprint ends when you stop moving or change stance; aim when the gun leaves
	 * your hand.
	 */
	private sprintOn = false;
	private aimOn = false;

	constructor(
		private input: InputMap,
		private client: GameClient
	) {
		this.unsubscribe = input.onPressed((action) => {
			if (!this.state) return;
			// Tap vs. long press is decided in `updateStanceKey` once we know how long it's held.
			if (action === 'stance') {
				this.stancePressedAt = performance.now();
				this.sprintOn = false;
			}
			if (action === 'sprint' && settings.accessibility.toggleSprint)
				this.sprintOn = !this.sprintOn;
			// Only a gun aims: with anything else the aim key throws, every press.
			if (action === 'aim' && settings.accessibility.toggleAim && this.gunInHand()) {
				this.aimOn = !this.aimOn;
			}
			if (action === 'headlamp') this.lamp = ((this.lamp + 1) % 3) as HeadlampMode;
			if (action === 'primaryWeapon') this.select = HAND.primary;
			if (action === 'secondaryWeapon') this.select = HAND.secondary;
			// Two weapons: either direction is the other one (the primary, from a quick-use item).
			if (action === 'nextItem' || action === 'prevItem') {
				const now = this.select >= 0 ? this.select : this.state.inventory.selected;
				this.select = now === HAND.primary ? HAND.secondary : HAND.primary;
			}
		});
	}

	/** Take something in the hand (see `Inventory.selected`): what the quick-use wheel chose. */
	take(selected: number): void {
		this.select = selected;
	}

	private gunInHand(): boolean {
		const stack = this.state ? held(this.state.inventory) : null;
		return !!(stack && ITEMS[stack.item]?.firearm);
	}

	/** Sprinting this frame: the key held, or switched on (toggle setting). */
	private sprinting(active: boolean): boolean {
		if (!active) return false;
		return settings.accessibility.toggleSprint ? this.sprintOn : this.input.isDown('sprint');
	}

	/** Aiming this frame: the key held, or switched on with a gun in hand (toggle setting). */
	private aiming(active: boolean): boolean {
		if (!active || this.wheel) return false;
		if (settings.accessibility.toggleAim && this.gunInHand()) return this.aimOn;
		return this.input.isDown('aim');
	}

	/** Open the quick-use wheel: until it closes, the mouse moves its pointer, not the view. */
	openWheel(): void {
		this.wheel = { x: 0, y: 0 };
	}

	/** Close the wheel. Returns where its pointer was (null if it wasn't open). */
	closeWheel(): { x: number; y: number } | null {
		const pointer = this.wheel;
		this.wheel = null;
		return pointer;
	}

	/** The wheel's pointer from its centre, each axis -1..1; null while the wheel is closed. */
	get wheelPointer(): { x: number; y: number } | null {
		return this.wheel ? { x: this.wheel.x / WHEEL_REACH, y: this.wheel.y / WHEEL_REACH } : null;
	}

	/** Predicted simulation events since the last call: shots, swings, reloads (local feedback). */
	drainEvents(): SimEvent[] {
		const out = this.events;
		this.events = [];
		return out;
	}

	/** Wanted stance and creep, for the HUD. */
	get modes(): { stance: Stance; creep: boolean } {
		return { stance: this.stance, creep: this.creep };
	}

	/**
	 * Stance key: a tap (released within LONG_PRESS_MS) cycles walk -> crouch -> crawl; while the
	 * key is held, you creep (slow, silent), and releasing a hold leaves the stance unchanged.
	 * Sprinting stops creeping and drops back to a normal walk.
	 */
	private updateStanceKey(active: boolean): void {
		const input = this.input;
		const sprinting = this.sprinting(active);
		if (this.stancePressedAt !== null && !input.isDown('stance')) {
			const held = performance.now() - this.stancePressedAt;
			if (held < LONG_PRESS_MS) {
				this.stance = STANCE_CYCLE[(STANCE_CYCLE.indexOf(this.stance) + 1) % 3];
			}
			this.stancePressedAt = null;
		}
		// Creep starts on press so it responds immediately; a tap only creeps for its brief moment.
		this.creep = this.stancePressedAt !== null && !sprinting;
		if (sprinting) this.stance = 'stand';
	}

	/** The collision world being predicted against (null while not in an expedition). */
	get collision(): CollisionWorld | null {
		return this.world;
	}

	/** Left the expedition (extracted): stop predicting until the next map arrives. */
	leave(): void {
		this.world = null;
		this.state = null;
		this.previous = null;
		this.pending = [];
		this.outbox = [];
	}

	/** New map: drop prediction and wait for the server's first snapshot. */
	setWorld(world: CollisionWorld): void {
		this.world = world;
		this.state = null;
		this.previous = null;
		this.pending = [];
		this.outbox = [];
	}

	/** Reconcile with the server's authoritative state for this player. */
	onSnapshot(snapshot: PlayerSnapshot): void {
		if (!this.world) return;
		if (!this.state) {
			this.state = clonePlayerState(snapshot.state);
			this.previous = clonePlayerState(snapshot.state);
			this.yaw = snapshot.state.yaw;
			this.pitch = snapshot.state.pitch;
			this.lamp = snapshot.state.headlamp;
			this.stance = snapshot.state.stance;
			return;
		}
		const corrected = clonePlayerState(snapshot.state);
		this.pending = this.pending.filter((frame) => frame.seq > snapshot.ack);
		for (const frame of this.pending) stepPlayer(corrected, frame, this.world, DT);
		const old = this.state.position;
		const error: Vec3 = [
			old[0] - corrected.position[0],
			old[1] - corrected.position[1],
			old[2] - corrected.position[2]
		];
		if (Math.hypot(...error) > SNAP_DISTANCE) this.offset = [0, 0, 0];
		else for (let i = 0; i < 3; i++) this.offset[i] += error[i];
		this.state = corrected;
		this.previous = clonePlayerState(corrected);
	}

	/**
	 * Advance by a frame's `delta` seconds. `active` is false while the pointer is unlocked or a
	 * menu is open: the player then stands still (but the simulation keeps running).
	 */
	update(delta: number, active: boolean): void {
		this.updateStanceKey(active);
		const [dx, dy] = this.input.consumeLook();
		if (this.wheel) {
			const x = this.wheel.x + dx;
			const y = this.wheel.y + dy;
			const scale = Math.min(1, WHEEL_REACH / (Math.hypot(x, y) || 1));
			this.wheel = { x: x * scale, y: y * scale };
		} else if (active) {
			// Aiming (zoomed in) has its own sensitivity on top of the general one.
			const aim = this.lookScale < 1 ? settings.controls.aimSensitivity : 1;
			const speed = LOOK_SPEED * settings.controls.mouseSensitivity * aim * this.lookScale;
			this.yaw -= dx * speed;
			this.pitch -= dy * speed * (settings.controls.invertY ? -1 : 1);
			this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
		}
		// Recoil throws the view over a few frames, not in one jump.
		const take = 1 - Math.exp(-delta / KICK_TIME);
		this.yaw += this.kickLeft.yaw * take;
		this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + this.kickLeft.pitch * take));
		this.kickLeft.pitch *= 1 - take;
		this.kickLeft.yaw *= 1 - take;
		const state = this.state;
		const world = this.world;
		if (!state || !world) return;

		this.accumulator += delta;
		let steps = 0;
		while (this.accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
			this.accumulator -= DT;
			steps++;
			const frame = this.sample(active);
			this.previous = clonePlayerState(state);
			stepPlayer(state, frame, world, DT, MOVEMENT, DEFAULT_HEADLAMP, this.events);
			this.pending.push(frame);
			this.outbox.push(frame);
		}
		if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
		if (this.pending.length > MAX_PENDING)
			this.pending.splice(0, this.pending.length - MAX_PENDING);
		if (this.outbox.length) {
			this.client.send({ type: 'input', frames: this.outbox });
			this.outbox = [];
		}

		const decay = Math.exp(-delta / SMOOTHING);
		for (let i = 0; i < 3; i++) this.offset[i] *= decay;
		const targetEye = eyeHeight(state);
		this.eye += (targetEye - this.eye) * Math.min(1, delta * 10);
	}

	/** Where the feet are drawn: interpolated between sim steps, with correction smoothing. */
	feetPosition(): Vec3 | null {
		const state = this.state;
		if (!state) return null;
		const prev = this.previous ?? state;
		const alpha = this.accumulator / DT;
		const p = (i: number) => prev.position[i] + (state.position[i] - prev.position[i]) * alpha;
		return [p(0) + this.offset[0], p(1) + this.offset[1], p(2) + this.offset[2]];
	}

	/** Camera position: the feet plus the (smoothed) eye height. */
	eyePosition(): Vec3 | null {
		const feet = this.feetPosition();
		return feet && [feet[0], feet[1] + this.eye, feet[2]];
	}

	/** A shot's recoil: throw the view up by `pitch` and aside by `yaw` (radians). */
	kick(pitch: number, yaw: number): void {
		this.kickLeft.pitch += pitch;
		this.kickLeft.yaw += yaw;
	}

	look(): { yaw: number; pitch: number } {
		// Dip the view while hauling up onto a ledge.
		const mantle = this.state?.mantle;
		const dip = mantle ? Math.sin((mantle.t / mantle.duration) * Math.PI) * 0.18 : 0;
		return { yaw: this.yaw, pitch: this.pitch - dip };
	}

	dispose(): void {
		this.unsubscribe();
	}

	private takeSelect(): number {
		const slot = this.select;
		this.select = -1;
		return slot;
	}

	private sample(active: boolean): InputFrame {
		const input = this.input;
		const axis = (pos: boolean, neg: boolean) => (pos ? 1 : 0) - (neg ? 1 : 0);
		const moveX = active ? axis(input.isDown('moveRight'), input.isDown('moveLeft')) : 0;
		const moveZ = active ? axis(input.isDown('moveForward'), input.isDown('moveBack')) : 0;
		// A switched-on sprint ends when you stop; a switched-on aim when the gun leaves the hand.
		if (active && moveX === 0 && moveZ === 0) this.sprintOn = false;
		if (!this.gunInHand()) this.aimOn = false;
		return {
			seq: this.seq++,
			moveX,
			moveZ,
			yaw: this.yaw,
			pitch: this.pitch,
			sprint: this.sprinting(active),
			sneak: this.creep,
			climb: active && input.isDown('climb'),
			swimDown: active && input.isDown('swimDown'),
			interact: active && input.isDown('interact'),
			// Choosing from the wheel is not a swing or a shot.
			attack: active && !this.wheel && input.isDown('attack'),
			aim: this.aiming(active),
			reload: active && input.isDown('reload'),
			drop: active && input.isDown('drop'),
			select: this.takeSelect(),
			stance: this.stance,
			headlamp: this.lamp
		};
	}
}
