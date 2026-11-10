import * as THREE from 'three';
import { DEFAULT_HEADLAMP, type HeadlampModel } from '#lib/content/items/headlamps.ts';
import { headlampOutput } from '#lib/shared/player/headlamp.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

/**
 * The player's headlamp: a shadow-casting spotlight on the camera, driven by the shared
 * `headlampOutput` so flicker matches the simulation. Counts toward the light budget.
 */
export class Headlamp {
	readonly light: THREE.SpotLight;

	constructor(
		camera: THREE.Camera,
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
		camera.add(this.light);
		camera.add(this.light.target);
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
		this.light.visible = !!out?.on;
		if (!out?.on) return;
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
