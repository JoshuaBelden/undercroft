import * as THREE from 'three';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import { bodyHeight, eyeHeight } from '#lib/shared/player/simulate.ts';
import type { PlayerSnapshot, PlayerState } from '#lib/shared/player/types.ts';
import { Headlamp } from './Headlamp.ts';

interface RemoteBody {
	root: THREE.Group;
	body: THREE.Mesh;
	/** Pivot at eye height, turned by yaw and pitch; carries the headlamp. */
	head: THREE.Object3D;
	lamp: Headlamp;
	state: PlayerState;
	/** Seconds since the last snapshot; advances the lamp clock so flicker stays smooth. */
	since: number;
	target: THREE.Vector3;
}

/**
 * Other players: a placeholder capsule that eases toward its latest snapshot, plus their
 * headlamp, driven by the shared headlamp output so it flickers exactly as it does for them.
 * Proper interpolation and models arrive with multiplayer polish (Phase 3).
 */
export class RemotePlayers {
	readonly root = new THREE.Group();
	private bodies = new Map<string, RemoteBody>();
	private geometry = new THREE.CapsuleGeometry(MOVEMENT.radius, 1, 4, 8);
	private material = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.9 });
	private shadows = { enabled: true, mapSize: 512 };

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

	apply(snapshots: PlayerSnapshot[], selfId: string | null): void {
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
			remote.target.set(...snap.state.position);
		}
		for (const [id, remote] of this.bodies) {
			if (seen.has(id)) continue;
			remote.lamp.dispose();
			remote.root.removeFromParent();
			this.bodies.delete(id);
		}
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
		for (const remote of this.bodies.values()) {
			const { root, body, head, state } = remote;
			root.position.lerp(remote.target, t);
			// Body: capsule scaled to the current stance (or swimming) height.
			const height = bodyHeight(state);
			const shaft = Math.max(0.01, height - MOVEMENT.radius * 2);
			body.scale.set(1, shaft, 1);
			body.position.y = height / 2;
			// Head: eye height, facing where they look. Turn the short way round.
			head.position.y += (eyeHeight(state) - head.position.y) * t;
			let dyaw = state.yaw - head.rotation.y;
			dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
			head.rotation.y += dyaw * t;
			head.rotation.x += (state.pitch - head.rotation.x) * t;
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
			target: new THREE.Vector3(...snap.state.position)
		};
	}
}
