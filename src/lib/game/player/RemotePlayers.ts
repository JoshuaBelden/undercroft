import * as THREE from 'three';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import { bodyHeight, eyeHeight } from '#lib/shared/player/simulate.ts';
import type { PlayerSnapshot, PlayerState } from '#lib/shared/player/types.ts';
import { Headlamp } from './Headlamp.ts';

/** Where a remote player was at a moment of server time. */
interface Sample {
	/** Server time, seconds. */
	time: number;
	position: THREE.Vector3;
	yaw: number;
	pitch: number;
}

/** Remote players are drawn this far in the past (two server ticks), between two snapshots. */
const INTERPOLATION_DELAY = 0.1;
/** Snapshots kept per player; enough to cover the delay through a few late packets. */
const MAX_SAMPLES = 10;
/** A jump this far (m) between snapshots is a teleport: snap instead of sliding. */
const TELEPORT = 6;

interface RemoteBody {
	root: THREE.Group;
	body: THREE.Mesh;
	/** Pivot at eye height, turned by yaw and pitch; carries the headlamp. */
	head: THREE.Object3D;
	lamp: Headlamp;
	state: PlayerState;
	/** Seconds since the last snapshot; advances the lamp clock so flicker stays smooth. */
	since: number;
	/** Recent snapshots, oldest first. */
	samples: Sample[];
}

/**
 * Other players: a placeholder capsule plus their headlamp, driven by the shared headlamp output
 * so it flickers exactly as it does for them.
 *
 * Movement is snapshot interpolation: each player is drawn `INTERPOLATION_DELAY` behind the
 * server, between the two snapshots either side of that moment, so motion is smooth at any frame
 * rate and a late packet doesn't show. Only the local player is predicted. See
 * docs/dev/player.md.
 */
export class RemotePlayers {
	readonly root = new THREE.Group();
	private bodies = new Map<string, RemoteBody>();
	private geometry = new THREE.CapsuleGeometry(MOVEMENT.radius, 1, 4, 8);
	private material = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.9 });
	private shadows = { enabled: true, mapSize: 512 };
	/**
	 * Server clock minus local clock, seconds: turns "now" into server time. Follows the
	 * least-delayed packet, so network jitter doesn't move it.
	 */
	private offset: number | null = null;

	constructor() {
		this.root.name = 'remote-players';
	}

	/** Shadow settings for remote headlamps (kept at most 512 px; they're secondary lights). */
	setShadows(enabled: boolean, mapSize: number): void {
		this.shadows = { enabled, mapSize: Math.min(512, mapSize) };
		for (const remote of this.bodies.values()) {
			remote.lamp.setShadows(enabled, this.shadows.mapSize);
		}
	}

	/** Take a tick's player snapshots; `serverTime` is the tick's timestamp in milliseconds. */
	apply(snapshots: PlayerSnapshot[], selfId: string | null, serverTime: number): void {
		const time = serverTime / 1000;
		const offset = time - performance.now() / 1000;
		// Creep down slowly so a one-off early packet can't pin the clock ahead for good.
		this.offset = this.offset === null ? offset : Math.max(offset, this.offset - 0.0005);
		const seen = new Set<string>();
		for (const snap of snapshots) {
			if (snap.id === selfId) continue;
			seen.add(snap.id);
			let remote = this.bodies.get(snap.id);
			if (!remote) {
				remote = this.create(snap);
				this.bodies.set(snap.id, remote);
			}
			remote.state = snap.state;
			remote.since = 0;
			remote.samples.push(sample(time, snap.state));
			if (remote.samples.length > MAX_SAMPLES) remote.samples.shift();
		}
		for (const [id, remote] of this.bodies) {
			if (seen.has(id)) continue;
			this.remove(id, remote);
		}
	}

	/** Nobody is here any more (the expedition ended for us). */
	clear(): void {
		for (const [id, remote] of this.bodies) this.remove(id, remote);
		this.offset = null;
	}

	/** Each remote player's latest state, with the lamp clock advanced to now (for lighting). */
	*states(): Iterable<PlayerState> {
		for (const remote of this.bodies.values()) {
			yield {
				...remote.state,
				position: [remote.root.position.x, remote.root.position.y, remote.root.position.z],
				lampClock: remote.state.lampClock + remote.since
			};
		}
	}

	update(delta: number): void {
		const t = Math.min(1, delta * 12);
		const renderTime = performance.now() / 1000 + (this.offset ?? 0) - INTERPOLATION_DELAY;
		for (const remote of this.bodies.values()) {
			const { root, body, head, state } = remote;
			const [from, to, blend] = bracket(remote.samples, renderTime);
			if (from.position.distanceTo(to.position) > TELEPORT) root.position.copy(to.position);
			else root.position.lerpVectors(from.position, to.position, blend);
			// Body: capsule scaled to the current stance (or swimming) height.
			const height = bodyHeight(state);
			const shaft = Math.max(0.01, height - MOVEMENT.radius * 2);
			body.scale.set(1, shaft, 1);
			body.position.y = height / 2;
			// Head: eye height, facing where they look. Turn the short way round.
			head.position.y += (eyeHeight(state) - head.position.y) * t;
			const turn = to.yaw - from.yaw;
			head.rotation.y = from.yaw + Math.atan2(Math.sin(turn), Math.cos(turn)) * blend;
			head.rotation.x = from.pitch + (to.pitch - from.pitch) * blend;
			remote.since += delta;
			const lit = state.headlamp !== 0 && state.battery > 0;
			remote.lamp.update(lit ? { ...state, lampClock: state.lampClock + remote.since } : state);
		}
	}

	dispose(): void {
		for (const remote of this.bodies.values()) remote.lamp.dispose();
		this.root.clear();
		this.bodies.clear();
		this.geometry.dispose();
		this.material.dispose();
	}

	private remove(id: string, remote: RemoteBody): void {
		remote.lamp.dispose();
		remote.root.removeFromParent();
		this.bodies.delete(id);
	}

	private create(snap: PlayerSnapshot): RemoteBody {
		const root = new THREE.Group();
		root.name = `remote-${snap.name}`;
		root.position.set(...snap.state.position);
		const body = new THREE.Mesh(this.geometry, this.material);
		// The headlamp sits inside the body: if the body cast shadows, its own lamp would be
		// blocked by it (shadow passes render back faces). Real models will use layers instead.
		body.castShadow = false;
		root.add(body);
		const head = new THREE.Object3D();
		head.rotation.order = 'YXZ';
		head.position.y = eyeHeight(snap.state);
		head.rotation.set(snap.state.pitch, snap.state.yaw, 0);
		root.add(head);
		const lamp = new Headlamp(head);
		lamp.setShadows(this.shadows.enabled, this.shadows.mapSize);
		this.root.add(root);
		return {
			root,
			body,
			head,
			lamp,
			state: snap.state,
			since: 0,
			samples: []
		};
	}
}

function sample(time: number, state: PlayerState): Sample {
	return {
		time,
		position: new THREE.Vector3(...state.position),
		yaw: state.yaw,
		pitch: state.pitch
	};
}

/**
 * The two samples either side of `time` and how far between them it falls (0..1). Before the
 * first or after the last sample it holds that one: remote players are never extrapolated.
 */
function bracket(samples: Sample[], time: number): [Sample, Sample, number] {
	const last = samples[samples.length - 1];
	if (time >= last.time) return [last, last, 0];
	for (let i = samples.length - 2; i >= 0; i--) {
		const from = samples[i];
		if (time < from.time) continue;
		const to = samples[i + 1];
		return [from, to, (time - from.time) / Math.max(1e-6, to.time - from.time)];
	}
	return [samples[0], samples[0], 0];
}
