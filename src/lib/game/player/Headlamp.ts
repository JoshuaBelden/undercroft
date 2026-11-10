import * as THREE from 'three';
import { DEFAULT_HEADLAMP, type HeadlampModel } from '#lib/content/items/headlamps.ts';
import { headlampOutput } from '#lib/shared/player/headlamp.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

/**
 * A player's headlamp: a shadow-casting spotlight on a head object (the camera for the local
 * player, a head pivot for remote players), driven by the shared `headlampOutput` so flicker
 * matches the simulation on every client. Counts toward the light budget.
 */
export class Headlamp {
	readonly light: THREE.SpotLight;

	constructor(
		head: THREE.Object3D,
		private model: HeadlampModel = DEFAULT_HEADLAMP
	) {
		this.light = new THREE.SpotLight(model.color, 0, 10, 0.5, 0.45, 2);
		this.light.name = 'headlamp';
		// Slightly above and right of the eye, so shadows read as coming from the forehead.
		this.light.position.set(0.08, 0.06, 0);
		this.light.target.position.set(0.08, 0.06, -1);
		this.light.castShadow = true;
		this.light.shadow.camera.near = 0.1;
		this.light.shadow.bias = -0.0005;
		head.add(this.light);
		head.add(this.light.target);
	}

	setShadows(enabled: boolean, mapSize: number): void {
		this.light.castShadow = enabled;
		if (this.light.shadow.mapSize.x !== mapSize) {
			this.light.shadow.mapSize.set(mapSize, mapSize);
			this.light.shadow.map?.dispose();
			this.light.shadow.map = null;
		}
	}

	update(state: PlayerState | null): void {
		const out = state ? headlampOutput(state, this.model) : null;
		// Off = zero intensity, never `visible = false`: changing the number of visible lights
		// makes Three.js recompile every material, which hitches each time a lamp is toggled.
		if (!out?.on) {
			this.light.intensity = 0;
			return;
		}
		this.light.intensity = out.intensity;
		this.light.distance = out.range;
		this.light.angle = out.angle;
	}

	dispose(): void {
		this.light.removeFromParent();
		this.light.target.removeFromParent();
		this.light.dispose();
	}
}
