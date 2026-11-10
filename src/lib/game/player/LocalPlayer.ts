import { MOVEMENT } from '#lib/content/player/movement.ts';
import type { InputMap } from '#lib/game/input/InputMap.ts';
import type { GameClient } from '#lib/game/net/GameClient.ts';
import { settings } from '#lib/settings/settings.svelte.ts';
import { SIM_RATE } from '#lib/shared/constants.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import { clonePlayerState, stepPlayer } from '#lib/shared/player/simulate.ts';
import type {
	HeadlampMode,
	InputFrame,
	PlayerSnapshot,
	PlayerState,
	Stance
} from '#lib/shared/player/types.ts';

const DT = 1 / SIM_RATE;
/** Radians of look per pixel of mouse movement at sensitivity 1. */
const LOOK_SPEED = 0.0022;
const MAX_PITCH = 1.5;
/** Corrections larger than this snap instead of smoothing (teleports, respawns). */
const SNAP_DISTANCE = 2;
/** Seconds for a prediction correction to blend out. */
const SMOOTHING = 0.1;
/** Stop buffering if the server stops acknowledging (disconnected). */
const MAX_PENDING = SIM_RATE * 3;
const MAX_STEPS_PER_FRAME = 10;

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
	private crawl = false;
	private lamp: HeadlampMode = 1;
	private offset: Vec3 = [0, 0, 0];
	private eye: number = MOVEMENT.stances.stand.eye;
	private unsubscribe: () => void;

	constructor(
		private input: InputMap,
		private client: GameClient
	) {
		this.unsubscribe = input.onPressed((action) => {
			if (!this.state) return;
			if (action === 'crawl') this.crawl = !this.crawl;
			if (action === 'headlamp') this.lamp = ((this.lamp + 1) % 3) as HeadlampMode;
		});
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
			this.crawl = snapshot.state.stance === 'crawl';
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
		const [dx, dy] = this.input.consumeLook();
		if (active) {
			const speed = LOOK_SPEED * settings.controls.mouseSensitivity;
			this.yaw -= dx * speed;
			this.pitch -= dy * speed * (settings.controls.invertY ? -1 : 1);
			this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
		}
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
			stepPlayer(state, frame, world, DT);
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
		const targetEye = MOVEMENT.stances[state.stance].eye;
		this.eye += (targetEye - this.eye) * Math.min(1, delta * 10);
	}

	/** Camera position: interpolated between sim steps, with smoothing and eye height. */
	eyePosition(): Vec3 | null {
		const state = this.state;
		if (!state) return null;
		const prev = this.previous ?? state;
		const alpha = this.accumulator / DT;
		const p = (i: number) => prev.position[i] + (state.position[i] - prev.position[i]) * alpha;
		return [p(0) + this.offset[0], p(1) + this.offset[1] + this.eye, p(2) + this.offset[2]];
	}

	look(): { yaw: number; pitch: number } {
		return { yaw: this.yaw, pitch: this.pitch };
	}

	dispose(): void {
		this.unsubscribe();
	}

	private sample(active: boolean): InputFrame {
		const input = this.input;
		const axis = (pos: boolean, neg: boolean) => (pos ? 1 : 0) - (neg ? 1 : 0);
		const moveX = active ? axis(input.isDown('moveRight'), input.isDown('moveLeft')) : 0;
		const moveZ = active ? axis(input.isDown('moveForward'), input.isDown('moveBack')) : 0;
		let stance: Stance = 'stand';
		if (this.crawl) stance = 'crawl';
		else if (active && input.isDown('crouch')) stance = 'crouch';
		return {
			seq: this.seq++,
			moveX,
			moveZ,
			yaw: this.yaw,
			pitch: this.pitch,
			sprint: active && input.isDown('sprint'),
			stance,
			headlamp: this.lamp
		};
	}
}
