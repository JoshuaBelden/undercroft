import * as THREE from 'three';
import type { Vec3 } from '#lib/shared/map/types.ts';
import { createFlare, type Flare } from './flare.ts';

interface Puff {
	mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
	age: number;
	life: number;
	/** Metres across at birth and at the end. */
	from: number;
	to: number;
	opacity: number;
	spin: number;
	velocity: THREE.Vector3;
}

const MAX_PUFFS = 40;
const MAX_FLARES = 6;
/** Seconds the ambient pulse of your own shot lasts, and its peak (ambient, so no budget). */
const PULSE_TIME = 0.09;
const PULSE = 0.05;
const SMOKE_COLOR = 0x8c867e;

/**
 * Short-lived visual effects in the world. See docs/dev/items.md.
 *
 * - **Shots:** a shader flare at the muzzle (unlit, additive) and a few curls of smoke. The
 *   smoke is a lit material, so the flash, headlamps and the dark all read on it. The light of
 *   the shot itself is the shooter's headlamp (Headlamp.flash), so a shot adds no light.
 * - **Your own shot** also pulses a faint ambient light: the whole room, even behind you,
 *   catches a little of it. Ambient light doesn't count toward the light budget.
 * - **Impacts:** dust (stone) or a dark spatter (creature), and sparks off stone.
 */
export class Effects {
	readonly root = new THREE.Group();
	private ambient = new THREE.AmbientLight(0xffc890, 0);
	private pulseLeft = 0;
	private puffs: Puff[] = [];
	private flares: Flare[] = [];
	private geometry = new THREE.PlaneGeometry(1, 1);
	private alpha = puffTexture();
	private camera = new THREE.Quaternion();

	constructor() {
		this.root.name = 'effects';
		this.root.add(this.ambient);
		for (let i = 0; i < MAX_FLARES; i++) {
			const flare = createFlare();
			this.flares.push(flare);
			this.root.add(flare.mesh);
		}
	}

	/**
	 * A gunshot from `position` along `direction`. `flare` draws the muzzle flare in the world
	 * (off for your own first-person shots: the viewmodel draws that one). `own` adds the
	 * ambient pulse.
	 */
	shot(
		position: Vec3 | THREE.Vector3,
		direction: Vec3,
		options: { flare: boolean; own: boolean; heavy: boolean }
	): void {
		const at = toVector(position);
		const forward = new THREE.Vector3(...direction).normalize();
		if (options.flare) {
			const flare = this.flares.find((f) => !f.lit) ?? this.flares[0];
			flare.mesh.position.copy(at).addScaledVector(forward, 0.05);
			flare.fire(options.heavy ? 0.75 : 0.5, 0.06);
		}
		if (options.own) this.pulseLeft = PULSE_TIME;
		const curls = options.heavy ? 4 : 2;
		for (let i = 0; i < curls; i++) {
			const drift = forward
				.clone()
				.multiplyScalar(0.5 + Math.random() * 0.9)
				.add(new THREE.Vector3(jitter(0.15), 0.12 + Math.random() * 0.15, jitter(0.15)));
			this.puff(at.clone().addScaledVector(forward, 0.05 + i * 0.08), {
				life: 1.4 + Math.random() * 0.8,
				from: 0.08,
				to: options.heavy ? 0.9 : 0.6,
				opacity: 0.32,
				color: SMOKE_COLOR,
				velocity: drift
			});
		}
	}

	/** Where a shot landed: dust and sparks off stone, a dark spatter off a creature. */
	impact(position: Vec3, creature: boolean): void {
		const at = new THREE.Vector3(...position);
		this.puff(at, {
			life: creature ? 0.45 : 0.9,
			from: 0.05,
			to: creature ? 0.25 : 0.4,
			opacity: creature ? 0.6 : 0.45,
			color: creature ? 0x1a0c0c : 0x7a7268,
			velocity: new THREE.Vector3(jitter(0.2), creature ? -0.1 : 0.15, jitter(0.2))
		});
		if (!creature) {
			const spark = this.flares.find((f) => !f.lit);
			if (spark) {
				spark.mesh.position.copy(at);
				spark.fire(0.12, 0.05, 0xffb050);
			}
		}
	}

	update(delta: number, camera: THREE.Camera): void {
		camera.getWorldQuaternion(this.camera);
		this.pulseLeft = Math.max(0, this.pulseLeft - delta);
		this.ambient.intensity = PULSE * (this.pulseLeft / PULSE_TIME) ** 2;
		for (const flare of this.flares) flare.update(delta);
		for (const puff of [...this.puffs]) {
			puff.age += delta;
			const t = puff.age / puff.life;
			if (t >= 1) {
				this.removePuff(puff);
				continue;
			}
			// Slows as it spreads; grows fast then lingers.
			puff.mesh.position.addScaledVector(puff.velocity, delta * (1 - t));
			puff.mesh.scale.setScalar(puff.from + (puff.to - puff.from) * Math.sqrt(t));
			puff.mesh.quaternion.copy(this.camera);
			puff.mesh.rotateZ(puff.spin * puff.age);
			puff.mesh.material.opacity = puff.opacity * (1 - t) * Math.min(1, t * 12);
		}
	}

	dispose(): void {
		for (const puff of [...this.puffs]) this.removePuff(puff);
		for (const flare of this.flares) flare.dispose();
		this.geometry.dispose();
		this.alpha.dispose();
		this.root.clear();
	}

	private puff(
		at: THREE.Vector3,
		spec: {
			life: number;
			from: number;
			to: number;
			opacity: number;
			color: number;
			velocity: THREE.Vector3;
		}
	): void {
		if (this.puffs.length >= MAX_PUFFS) this.removePuff(this.puffs[0]);
		const material = new THREE.MeshLambertMaterial({
			color: spec.color,
			alphaMap: this.alpha,
			transparent: true,
			opacity: 0,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		const mesh = new THREE.Mesh(this.geometry, material);
		mesh.position.copy(at);
		mesh.scale.setScalar(spec.from);
		mesh.castShadow = false;
		mesh.receiveShadow = false;
		this.root.add(mesh);
		this.puffs.push({
			mesh,
			age: 0,
			life: spec.life,
			from: spec.from,
			to: spec.to,
			opacity: spec.opacity,
			spin: jitter(0.8),
			velocity: spec.velocity
		});
	}

	private removePuff(puff: Puff): void {
		puff.mesh.removeFromParent();
		puff.mesh.material.dispose();
		this.puffs = this.puffs.filter((p) => p !== puff);
	}
}

function toVector(position: Vec3 | THREE.Vector3): THREE.Vector3 {
	return position instanceof THREE.Vector3 ? position.clone() : new THREE.Vector3(...position);
}

function jitter(amount: number): number {
	return (Math.random() * 2 - 1) * amount;
}

/** A soft, ragged blob (alpha in the green channel, as alphaMap reads it). Made once. */
function puffTexture(): THREE.DataTexture {
	const size = 64;
	const data = new Uint8Array(size * size * 4);
	// Value noise on a coarse grid, two octaves.
	const grid = (cells: number) => {
		const values = Array.from({ length: (cells + 1) ** 2 }, () => Math.random());
		return (x: number, y: number) => {
			const gx = x * cells;
			const gy = y * cells;
			const ix = Math.min(cells - 1, Math.floor(gx));
			const iy = Math.min(cells - 1, Math.floor(gy));
			const fx = smooth(gx - ix);
			const fy = smooth(gy - iy);
			const at = (cx: number, cy: number) => values[cy * (cells + 1) + cx];
			const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
			const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
			return top + (bottom - top) * fy;
		};
	};
	const coarse = grid(4);
	const fine = grid(9);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const u = x / (size - 1);
			const v = y / (size - 1);
			const r = Math.hypot(u - 0.5, v - 0.5) * 2;
			const n = coarse(u, v) * 0.65 + fine(u, v) * 0.35;
			const edge = 1 - smooth(Math.min(1, Math.max(0, (r + (n - 0.5) * 0.55 - 0.25) / 0.75)));
			const a = Math.round(255 * edge * (0.55 + 0.45 * n));
			const i = (y * size + x) * 4;
			data[i] = data[i + 1] = data[i + 2] = a;
			data[i + 3] = 255;
		}
	}
	const texture = new THREE.DataTexture(data, size, size);
	texture.needsUpdate = true;
	return texture;
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}
