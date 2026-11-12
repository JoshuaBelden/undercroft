import * as THREE from 'three';
import { DEFAULT_HEADLAMP, type HeadlampModel } from '#lib/content/items/headlamps.ts';
import { headlampOutput } from '#lib/shared/player/headlamp.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

/** Seconds a muzzle flash lights the lamp. */
const FLASH_TIME = 0.07;
/** Peak candela: about twice the starter lamp's bright mode, over a far wider cone. */
const FLASH_INTENSITY = 120;
const FLASH_RANGE = 18;
/** Cone half-angle (radians) at the flash's peak: nearly everything in front of you. */
const FLASH_ANGLE = 1.15;
const FLASH_COLOR = new THREE.Color(0xffb366);

/**
 * A player's headlamp: a shadow-casting spotlight on a head object (the camera for the local
 * player, a head pivot for remote players), driven by the shared `headlampOutput` so flicker
 * matches the simulation on every client. Counts toward the light budget.
 *
 * It's also the light of that player's muzzle flash (`flash()`): for a moment the spot widens,
 * warms and blazes, lamp on or off. The flash costs no light of its own and casts real shadows.
 */
export class Headlamp {
	readonly light: THREE.SpotLight;
	private color: THREE.Color;
	/** performance.now() (ms) when the current flash ends. */
	private flashEnd = 0;

	constructor(
		head: THREE.Object3D,
		private model: HeadlampModel = DEFAULT_HEADLAMP
	) {
		this.light = new THREE.SpotLight(model.color, 0, 10, 0.5, 0.45, 2);
		this.color = this.light.color.clone();
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

	/** Move the lamp this far (m) ahead of the eye point: clear of a drawn body's head. */
	setForward(distance: number): void {
		this.light.position.z = -distance;
		this.light.target.position.z = -distance - 1;
	}

	setShadows(enabled: boolean, mapSize: number): void {
		this.light.castShadow = enabled;
		if (this.light.shadow.mapSize.x !== mapSize) {
			this.light.shadow.mapSize.set(mapSize, mapSize);
			this.light.shadow.map?.dispose();
			this.light.shadow.map = null;
		}
	}

	/** Light up a gunshot from this player. */
	flash(): void {
		this.flashEnd = performance.now() + FLASH_TIME * 1000;
	}

	update(state: PlayerState | null): void {
		const out = state ? headlampOutput(state, this.model) : null;
		// Off = zero intensity, never `visible = false`: changing the number of visible lights
		// makes Three.js recompile every material, which hitches each time a lamp is toggled.
		const lamp = out?.on
			? { intensity: out.intensity, range: out.range, angle: out.angle }
			: { intensity: 0, range: FLASH_RANGE, angle: FLASH_ANGLE };
		// Flash strength, 1 at the shot fading to 0 (squared: a sharp peak, a quick fall).
		const left = (this.flashEnd - performance.now()) / (FLASH_TIME * 1000);
		const f = left > 0 ? Math.min(1, left) ** 2 : 0;
		const peak = {
			intensity: Math.max(FLASH_INTENSITY, lamp.intensity),
			range: Math.max(FLASH_RANGE, lamp.range)
		};
		this.light.intensity = lamp.intensity + (peak.intensity - lamp.intensity) * f;
		this.light.distance = lamp.range + (peak.range - lamp.range) * f;
		this.light.angle = lamp.angle + (FLASH_ANGLE - lamp.angle) * f;
		this.light.color.copy(this.color).lerp(FLASH_COLOR, f);
	}

	dispose(): void {
		this.light.removeFromParent();
		this.light.target.removeFromParent();
		this.light.dispose();
	}
}
