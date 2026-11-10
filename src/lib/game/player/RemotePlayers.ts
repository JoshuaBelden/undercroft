import * as THREE from 'three';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import type { PlayerSnapshot } from '#lib/shared/player/types.ts';

/**
 * Other players, drawn as placeholder capsules that ease toward their latest snapshot.
 * Proper interpolation and models arrive with multiplayer (Phase 3).
 */
export class RemotePlayers {
	readonly root = new THREE.Group();
	private bodies = new Map<string, { mesh: THREE.Mesh; target: THREE.Vector3 }>();
	private geometry = new THREE.CapsuleGeometry(MOVEMENT.radius, 1.15, 4, 8);
	private material = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.9 });

	constructor() {
		this.root.name = 'remote-players';
	}

	apply(snapshots: PlayerSnapshot[], selfId: string | null): void {
		const seen = new Set<string>();
		for (const snap of snapshots) {
			if (snap.id === selfId) continue;
			seen.add(snap.id);
			let body = this.bodies.get(snap.id);
			if (!body) {
				const mesh = new THREE.Mesh(this.geometry, this.material);
				mesh.castShadow = true;
				this.root.add(mesh);
				body = { mesh, target: new THREE.Vector3() };
				body.mesh.position.set(...snap.state.position);
				this.bodies.set(snap.id, body);
			}
			const [x, y, z] = snap.state.position;
			body.target.set(x, y + MOVEMENT.radius + 0.575, z);
		}
		for (const [id, body] of this.bodies) {
			if (seen.has(id)) continue;
			body.mesh.removeFromParent();
			this.bodies.delete(id);
		}
	}

	update(delta: number): void {
		const t = Math.min(1, delta * 12);
		for (const body of this.bodies.values()) body.mesh.position.lerp(body.target, t);
	}

	dispose(): void {
		this.root.clear();
		this.bodies.clear();
		this.geometry.dispose();
		this.material.dispose();
	}
}
