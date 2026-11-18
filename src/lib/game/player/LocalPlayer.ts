import { ITEMS } from '#lib/content/items.ts';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import type { Action } from '#lib/game/input/actions.ts';
import type { InputDevice } from '#lib/game/input/device.svelte.ts';
import type { InputMap } from '#lib/game/input/InputMap.ts';
import type { GameClient } from '#lib/game/net/GameClient.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { SIM_RATE } from '#lib/shared/constants.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import { held } from '#lib/shared/items/inventory.ts';
import { clonePlayerState, eyeHeight, handsBusy, stepPlayer } from '#lib/shared/player/simulate.ts';
import type { ClimberSpot } from '#lib/shared/player/climb.ts';
import {
	HAND,
	type HeadlampMode,
	type InputFrame,
	type PlayerSnapshot,
	type PlayerState,
	type SimEvent,
	type Stance,
	type SurveyHold
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
/** The right stick's top turn speed (radians a second) at sensitivity 1: about 180 degrees. */
const PAD_TURN = Math.PI;
/** The right stick's turn speed goes with its push raised to this: small pushes aim finely. */
const LOOK_CURVE = 2;
/** A left-stick push shorter than this creeps (slow and silent), as holding the stance key does. */
const CREEP_PUSH = 0.5;
/** The controller's toggled sprint ends when the left stick drops below this push. */
const SPRINT_PUSH = 0.6;

/**
 * The local player: samples input every fixed step, predicts movement with the shared
 * simulation, sends input frames to the server, and reconciles with server snapshots.
 * See docs/dev/player.md.
 */
/** Holding the headlamp key this long (ms) switches between low and bright; less is a tap. */
const LAMP_HOLD_MS = 400;

/** Hobbled: the limp in the view (see `updateLimp`). */
const LIMP = {
	/** Steps a second at full pace (one dip every other step). */
	stepsPerSecond: 1.8,
	/** Moving at this speed (m/s, a crawl) or more is full pace. */
	pace: 0.6,
	/** How far the eye drops (m) and the head nods down (radians) on the bad leg. */
	dip: 0.06,
	nod: 0.025
} as const;

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
	/** What the map screen is holding down (sketch or show), sent in every frame; see docs/dev/map.md. */
	survey: SurveyHold = null;
	/** Wanted stance, cycled by the stance key; the simulation rises only when there is room. */
	private stance: Stance = 'stand';
	private lamp: HeadlampMode = 1;
	/** The brightness the headlamp was last on at: a tap of its key comes back on at this. */
	private lampOn: 1 | 2 = 1;
	/** When the headlamp key went down (performance.now), until it is let go or held long enough. */
	private lampPressedAt: number | null = null;
	/** Creeping (slow, silent walk): while the stance key is held, or the left stick pushed lightly. */
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
	/** Attack held since before the wheel opened (a throw drawn back): it stays held until let go. */
	private wheelAttack = false;
	/** What the predicted simulation did since the last `drainEvents` (for instant feedback). */
	private events: SimEvent[] = [];
	/**
	 * Sprint and aim switched on by a press, instead of held: sprint with Accessibility > Toggle
	 * sprint on the keyboard, or Settings > Controller > Sprint: Toggle on the controller
	 * (`sprintBy` is which one); aim with Toggle aim. Sprint ends when you stop moving or change
	 * stance, and the controller's when you slow down or aim too (`updateSprint`); aim when the
	 * gun leaves your hand.
	 */
	private sprintBy: InputDevice | null = null;
	private climbers: ClimberSpot[] = [];
	/** Stance pressed on a rope: let go in the next frame. */
	private letGo = false;
	/** Hobbled: how much the limp shows (eases in and out, 0..1) and where in the step it is. */
	private limp = 0;
	private limpPhase = 0;
	private aimOn = false;

	constructor(
		private input: InputMap,
		private client: GameClient
	) {
		this.unsubscribe = input.onPressed((action, device) => {
			if (!this.state) return;
			// Tap vs. long press is decided in `updateStanceKey` once we know how long it's held.
			// Swimming has no stance: the controller's stance button is swim down there, and nobody
			// should climb out of the water crouched.
			if (action === 'stance' && !this.state.swimming && !this.state.climbing) {
				this.stancePressedAt = performance.now();
				this.sprintBy = null;
			}
			// On a rope, stance lets go (and changes nothing about your stance).
			if (action === 'stance' && this.state.climbing) this.letGo = true;
			if (action === 'sprint' && this.sprintToggles(device)) {
				this.sprintBy = this.sprintBy ? null : device;
			}
			// Only a gun aims.
			if (action === 'aim' && settings.accessibility.toggleAim && this.gunInHand()) {
				this.aimOn = !this.aimOn;
			}
			// Tap or hold is decided in `updateLampKey`.
			if (action === 'headlamp') this.lampPressedAt = performance.now();
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

	/** Sprinting this frame: switched on, or held on a device where it isn't a toggle. */
	private sprinting(active: boolean): boolean {
		if (!active) return false;
		const key = !this.sprintToggles('keyboard') && this.input.isDown('sprint', 'keyboard');
		const pad = !this.sprintToggles('pad') && this.input.isDown('sprint', 'pad');
		return this.sprintBy !== null || key || pad;
	}

	/** Whether this device's sprint button switches sprint on and off rather than being held. */
	private sprintToggles(device: InputDevice): boolean {
		if (device === 'pad') return settings.controller.sprint === 'toggle';
		return settings.accessibility.toggleSprint;
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
		this.wheelAttack = this.input.isDown('attack');
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

	/** The controller's switched-on sprint also ends when you slow down (the left stick) or aim. */
	private updateSprint(active: boolean): void {
		if (this.sprintBy !== 'pad') return;
		const stick = this.input.moveStick();
		const slow = Math.hypot(stick.x, stick.y) < SPRINT_PUSH;
		if (!active || slow || this.aiming(active) || this.stancePressedAt !== null) {
			this.sprintBy = null;
		}
	}

	/**
	 * Stance key: a tap (released within LONG_PRESS_MS) cycles walk -> crouch -> crawl; while the
	 * key is held, you creep (slow, silent), and releasing a hold leaves the stance unchanged.
	 * A light push of the left stick creeps too. Sprinting stops creeping and drops back to a
	 * normal walk.
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
		const stick = input.moveStick();
		const push = Math.hypot(stick.x, stick.y);
		const lightPush = active && push > 0 && push < CREEP_PUSH;
		// Creep starts on press so it responds immediately; a tap only creeps for its brief moment.
		this.creep = (this.stancePressedAt !== null || lightPush) && !sprinting;
		if (sprinting) this.stance = 'stand';
	}

	/**
	 * The headlamp key: a tap switches it off, or back on at the brightness it last had; held for
	 * LAMP_HOLD_MS it switches between low and bright (coming on, if it was off).
	 */
	private updateLampKey(): void {
		if (this.lampPressedAt === null) return;
		const held = performance.now() - this.lampPressedAt;
		if (held >= LAMP_HOLD_MS) {
			this.lampOn = this.lampOn === 1 ? 2 : 1;
			this.lamp = this.lampOn;
			// Done: letting go now is not a tap as well.
			this.lampPressedAt = null;
		} else if (!this.input.isDown('headlamp')) {
			if (this.lamp === 0) this.lamp = this.lampOn;
			else {
				this.lampOn = this.lamp;
				this.lamp = 0;
			}
			this.lampPressedAt = null;
		}
	}

	/**
	 * Where everyone else on a rope is (from the latest snapshots), so prediction stops short of
	 * them as the server does. The play page sets it each frame.
	 */
	setClimbers(spots: ClimberSpot[]): void {
		this.climbers = spots;
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
			if (this.lamp !== 0) this.lampOn = this.lamp;
			this.stance = snapshot.state.stance;
			return;
		}
		const corrected = clonePlayerState(snapshot.state);
		this.pending = this.pending.filter((frame) => frame.seq > snapshot.ack);
		for (const frame of this.pending) {
			stepPlayer(corrected, frame, this.world, DT, MOVEMENT, DEFAULT_HEADLAMP, [], this.climbers);
		}
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
	 * menu is open: the player then stands still (but the simulation keeps running). `reading`:
	 * the in-game menu is open, so the movement keys still walk, but the hands are busy
	 * (`handsBusy`) and the controller's stick is the menu's.
	 */
	update(delta: number, active: boolean, reading = false): void {
		this.updateSprint(active);
		this.updateStanceKey(active);
		this.updateLampKey();
		const [dx, dy] = this.input.consumeLook();
		const stick = this.input.lookStick();
		const push = Math.hypot(stick.x, stick.y);
		if (this.wheel) {
			// The right stick points straight at a slot; letting it go back keeps the choice.
			const x = push > 0 ? stick.x * WHEEL_REACH : this.wheel.x + dx;
			const y = push > 0 ? stick.y * WHEEL_REACH : this.wheel.y + dy;
			const scale = Math.min(1, WHEEL_REACH / (Math.hypot(x, y) || 1));
			this.wheel = { x: x * scale, y: y * scale };
		} else if (active) {
			// Aiming (zoomed in) has its own sensitivity on top of the general one.
			const aim = this.lookScale < 1 ? settings.controls.aimSensitivity : 1;
			const speed = LOOK_SPEED * settings.controls.mouseSensitivity * aim * this.lookScale;
			this.yaw -= dx * speed;
			this.pitch -= dy * speed * (settings.controls.invertY ? -1 : 1);
			// The right stick turns at a speed, not by a distance: its push, curved.
			const turn =
				PAD_TURN *
				settings.controller.lookSensitivity *
				this.lookScale *
				delta *
				push ** (LOOK_CURVE - 1);
			this.yaw -= stick.x * turn;
			this.pitch -= stick.y * turn * (settings.controller.invertY ? -1 : 1);
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
			const frame = this.sample(active, reading);
			this.previous = clonePlayerState(state);
			stepPlayer(state, frame, world, DT, MOVEMENT, DEFAULT_HEADLAMP, this.events, this.climbers);
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
		this.updateLimp(state, delta);
	}

	/**
	 * Hobbled and moving: a limp, the view dipping on every other step. Eases in and out, and
	 * follows Settings > Graphics > Camera shake.
	 */
	private updateLimp(state: PlayerState, delta: number): void {
		const speed = Math.hypot(state.velocity[0], state.velocity[2]);
		const hobbled = state.conditions.some((c) => c.id === 'hobble');
		const want = hobbled && state.grounded && speed > 0.05 ? 1 : 0;
		this.limp += (want - this.limp) * Math.min(1, delta * 4);
		this.limpPhase += delta * LIMP.stepsPerSecond * Math.PI * Math.min(1, speed / LIMP.pace);
	}

	/** The limp now: how far the eye dips (m) and the head nods (radians). */
	private limpOffset(): { dip: number; nod: number } {
		const amount = this.limp * settings.graphics.cameraShake;
		if (amount <= 0) return { dip: 0, nod: 0 };
		// Only the bad leg's step: a dip, then level on the good one.
		const step = Math.max(0, Math.sin(this.limpPhase)) ** 2;
		return { dip: step * LIMP.dip * amount, nod: step * LIMP.nod * amount };
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

	/** Camera position: the feet plus the (smoothed) eye height, less a hobbling limp. */
	eyePosition(): Vec3 | null {
		const feet = this.feetPosition();
		return feet && [feet[0], feet[1] + this.eye - this.limpOffset().dip, feet[2]];
	}

	/** Turn to face this way (dev: arriving where the free camera was, looking where it looked). */
	face(yaw: number, pitch: number): void {
		this.yaw = yaw;
		this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
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
		return { yaw: this.yaw, pitch: this.pitch - dip - this.limpOffset().nod };
	}

	dispose(): void {
		this.unsubscribe();
	}

	private takeLetGo(active: boolean): boolean {
		const letGo = active && this.letGo;
		this.letGo = false;
		return letGo;
	}

	private takeSelect(): number {
		const slot = this.select;
		this.select = -1;
		return slot;
	}

	private sample(active: boolean, reading: boolean): InputFrame {
		const input = this.input;
		const axis = (pos: boolean, neg: boolean) => (pos ? 1 : 0) - (neg ? 1 : 0);
		// The left stick, when pushed, as it is: half a push walks at half speed.
		const stick = input.moveStick();
		const pushed = stick.x !== 0 || stick.y !== 0;
		const key = (action: Action) => input.isDown(action, 'keyboard');
		const keysX = axis(key('moveRight'), key('moveLeft'));
		const keysZ = axis(key('moveForward'), key('moveBack'));
		const stickMoves = active && pushed;
		const walking = active || reading;
		const moveX = !walking ? 0 : stickMoves ? stick.x : keysX;
		const moveZ = !walking ? 0 : stickMoves ? -stick.y : keysZ;
		// A switched-on sprint ends when you stop; a switched-on aim when the gun leaves the hand.
		if (active && moveX === 0 && moveZ === 0) this.sprintBy = null;
		if (!this.gunInHand()) this.aimOn = false;
		const attacking = input.isDown('attack');
		if (!attacking) this.wheelAttack = false;
		return handsBusy({
			seq: this.seq++,
			moveX,
			moveZ,
			yaw: this.yaw,
			pitch: this.pitch,
			sprint: this.sprinting(active),
			sneak: this.creep,
			climb: active && input.isDown('climb'),
			swimDown: active && input.isDown('swimDown'),
			letGo: this.takeLetGo(active),
			interact: active && input.isDown('interact'),
			// Choosing from the wheel is not a swing or a shot; a throw drawn before it opened is
			// still drawn.
			attack: active && attacking && (!this.wheel || this.wheelAttack),
			aim: this.aiming(active),
			reload: active && input.isDown('reload'),
			select: this.takeSelect(),
			stance: this.stance,
			headlamp: this.lamp,
			survey: this.survey,
			reading
		});
	}
}
