import * as THREE from 'three';
import type { Vec3 } from '#lib/shared/map/types.ts';

interface Puff {
	mesh: THREE.Mesh;
	age: number;
	life: number;
}

/** Seconds a muzzle flash lasts. */
const FLASH_TIME = 0.06;
const FLASH_INTENSITY = 30;
const MAX_PUFFS = 16;

/**
 * Short-lived visual effects in the world: muzzle flashes (one reused point light, so the light
 * count never changes; it only counts toward the light budget for the instant it's lit) and
 * dust puffs where shots land. See docs/dev/items.md.
 */
export class Effects {
	readonly root = new THREE.Group();
	private flash = new THREE.PointLight(0xffc880, 0, 12, 2);
	private flashLeft = 0;
	private puffs: Puff[] = [];
	private geometry = new THREE.SphereGeometry(1, 6, 4);

	constructor() {
		this.root.name = 'effects';
		this.root.add(this.flash);
	}

	muzzleFlash(position: Vec3 | THREE.Vector3): void {
		if (position instanceof THREE.Vector3) this.flash.position.copy(position);
		else this.flash.position.set(...position);
		this.flashLeft = FLASH_TIME;
	}

	/** A small burst of dust (stone) or something darker (a creature). */
	impact(position: Vec3, creature: boolean): void {
		if (this.puffs.length >= MAX_PUFFS) this.removePuff(this.puffs[0]);
		const material = new THREE.MeshBasicMaterial({
			color: creature ? 0x120808 : 0x6a6258,
			transparent: true,
			opacity: 0.5,
			depthWrite: false
		});
		const mesh = new THREE.Mesh(this.geometry, material);
		mesh.position.set(...position);
		mesh.scale.setScalar(0.04);
		this.root.add(mesh);
		this.puffs.push({ mesh, age: 0, life: 0.5 });
	}

	update(delta: number): void {
		this.flashLeft = Math.max(0, this.flashLeft - delta);
		this.flash.intensity = this.flashLeft > 0 ? FLASH_INTENSITY * (this.flashLeft / FLASH_TIME) : 0;
		for (const puff of [...this.puffs]) {
			puff.age += delta;
			const t = puff.age / puff.life;
			if (t >= 1) {
				this.removePuff(puff);
				continue;
			}
			puff.mesh.scale.setScalar(0.04 + t * 0.2);
			(puff.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
		}
	}

	dispose(): void {
		for (const puff of [...this.puffs]) this.removePuff(puff);
		this.geometry.dispose();
		this.root.clear();
	}

	private removePuff(puff: Puff): void {
		puff.mesh.removeFromParent();
		(puff.mesh.material as THREE.Material).dispose();
		this.puffs = this.puffs.filter((p) => p !== puff);
	}
}
