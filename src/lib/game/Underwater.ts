import * as THREE from 'three';
import { waterSurface, type CollisionWorld } from '#lib/shared/map/collision.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';

/** Murky green-black water: what everything fades into a few metres away. */
const COLOR = 0x061614;
/** Fog density at full strength (FogExp2): about 4 m to half-hidden, 9 m to gone. */
const DENSITY = 0.16;
/** Seconds to go fully under or fully clear. */
const FADE = 0.2;

/**
 * How it looks with your eyes under the water: thick, dark fog closes in round the camera (the
 * screen overlay, UnderwaterOverlay.svelte, adds the tint and the wobble, and the audio is
 * already muffled). Decided by where the camera is, not the body, so it also follows the
 * over-the-shoulder view and the free camera. See docs/dev/player.md#underwater.
 */
export class Underwater {
	private readonly fog = new THREE.FogExp2(COLOR, 0);
	private amount = 0;

	constructor(private scene: THREE.Scene) {}

	/** True when `camera` (world space) is under a water surface. */
	static below(world: CollisionWorld | null, camera: Vec3): boolean {
		if (!world) return false;
		const surface = waterSurface(world, camera);
		return surface !== null && camera[1] < surface;
	}

	/** Fade toward under (or clear) and apply it. Returns how far under it looks, 0..1. */
	update(under: boolean, delta: number): number {
		const target = under ? 1 : 0;
		const step = delta / FADE;
		this.amount =
			target > this.amount
				? Math.min(target, this.amount + step)
				: Math.max(target, this.amount - step);
		if (this.amount > 0) {
			this.fog.density = DENSITY * this.amount;
			this.scene.fog = this.fog;
		} else if (this.scene.fog === this.fog) {
			this.scene.fog = null;
		}
		return this.amount;
	}

	/** Back to clear at once (leaving the map, map view). */
	reset(): void {
		this.amount = 0;
		if (this.scene.fog === this.fog) this.scene.fog = null;
	}
}
