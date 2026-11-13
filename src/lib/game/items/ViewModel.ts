import * as THREE from 'three';
import { ITEMS } from '#lib/content/items.ts';
import { loadModel } from '#lib/game/assets.ts';
import { flashStrength, SteadyLight } from '#lib/game/flashing.ts';
import { createFlare } from './flare.ts';
import { held } from '#lib/shared/items/inventory.ts';
import { EQUIP_TIME } from '#lib/shared/items/weapons.ts';
import { headlampOutput } from '#lib/shared/player/headlamp.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

/**
 * Where the hand rests when aiming down the sights, for items without their own `hold.aim`:
 * closer, low and a little right, so the gun points at the crosshair without covering it.
 */
const AIM_OFFSET: [number, number, number] = [0.06, -0.15, -0.34];
/** Recoil in the hands for anything that fires without its own `recoil`. */
const DEFAULT_RECOIL = { rise: 0.35, back: 0.05, settle: 0.14 };
/** Fill light on the held item at full lamp, and the faint light it keeps in the dark. */
const FILL = 2.2;
const DARK_FILL = 0.04;
/** The gun lit by its own flash: fill added at the shot, fading over FLASH_TIME seconds. */
const FLASH_FILL = 9;
const FLASH_TIME = 0.07;

/**
 * The item in your hands, drawn in the engine's viewmodel pass. Motion is procedural, from the
 * predicted weapon state: walk bob, equip, swing arc, recoil, reload dip, throw, aiming. It's lit
 * by a fill that follows your headlamp, so it goes dark when your lamp does. Your own muzzle
 * flare is drawn here, at the barrel's end, and flashes the fill. See docs/dev/items.md.
 */
export class ViewModel {
	private root = new THREE.Group();
	private pivot = new THREE.Group();
	private fill = new THREE.PointLight(0xffe2b0, 0, 3, 1.5);
	private ambient = new THREE.AmbientLight(0xffffff, DARK_FILL);
	private flare = createFlare();
	private flashLeft = 0;
	/** The lamp's flicker on the gun, smoothed with the "Reduce flashing" setting. */
	private steady = new SteadyLight();
	private item: string | null = null;
	private model: THREE.Object3D | null = null;
	private loading = 0;
	private bob = 0;
	private aim = 0;
	private kick = 0;
	private lastShotTime = -1;

	constructor(
		private scene: THREE.Scene,
		private camera: THREE.PerspectiveCamera
	) {
		this.root.add(this.pivot);
		this.pivot.add(this.flare.mesh);
		this.scene.add(this.root, this.ambient);
		this.camera.add(this.fill);
		this.fill.position.set(0.1, 0.15, 0.1);
		this.scene.add(this.camera);
	}

	update(delta: number, state: PlayerState | null, visible: boolean): void {
		const stack = state && !state.downed ? held(state.inventory) : null;
		const id = visible ? (stack?.item ?? null) : null;
		if (id !== this.item) this.setItem(id);
		this.root.visible = !!this.model && visible;
		if (!state || !this.model) return;
		const def = this.item ? ITEMS[this.item] : undefined;
		if (!def) return;

		const out = headlampOutput(state);
		const level = this.steady.follow(out.on ? out.level : 0);
		this.flashLeft = Math.max(0, this.flashLeft - delta);
		this.flare.update(delta);
		this.fill.intensity =
			FILL * level * (state.headlamp === 2 ? 1.3 : 1) +
			FLASH_FILL * flashStrength() * (this.flashLeft / FLASH_TIME) ** 2;

		const w = state.weapon;
		const speed = Math.hypot(state.velocity[0], state.velocity[2]);
		this.bob += delta * (4 + speed * 2.5);
		this.aim += ((w.aiming ? 1 : 0) - this.aim) * Math.min(1, delta * 12);
		if (w.action === 'shot' && w.time < this.lastShotTime) this.kick = 1;
		if (w.action === 'shot' && this.lastShotTime < 0) this.kick = 1;
		this.lastShotTime = w.action === 'shot' ? w.time : -1;
		const recoil = def.firearm?.recoil ?? DEFAULT_RECOIL;
		this.kick = Math.max(0, this.kick - delta / recoil.settle);

		const [hx, hy, hz] = def.hold.offset;
		const aim = new THREE.Vector3(...(def.hold.aim ?? AIM_OFFSET));
		const rest = new THREE.Vector3(hx, hy, hz).lerp(aim, this.aim);
		const bobAmount = Math.min(1, speed / 2.5) * (1 - this.aim * 0.8);
		const pos = rest.clone();
		pos.x += Math.sin(this.bob) * 0.012 * bobAmount;
		pos.y += Math.abs(Math.cos(this.bob)) * 0.012 * bobAmount;
		const rot = new THREE.Euler(0, 0, 0, 'YXZ');

		switch (w.action) {
			case 'equip': {
				// Comes up from below.
				const t = Math.min(1, w.time / EQUIP_TIME);
				pos.y -= (1 - easeOut(t)) * 0.25;
				rot.x -= (1 - t) * 0.6;
				break;
			}
			case 'swing': {
				const melee = def.melee;
				if (!melee) break;
				if (w.time < melee.windup) {
					// Draw back and up.
					const t = easeOut(w.time / melee.windup);
					rot.x += t * 0.7;
					rot.z -= t * 0.25;
					pos.y += t * 0.05;
					pos.z += t * 0.06;
				} else {
					// Strike down and across (fast), then settle back (slow).
					const r = Math.min(1, (w.time - melee.windup) / melee.recovery);
					const strike = r < 0.3 ? r / 0.3 : 1 - (r - 0.3) / 0.7;
					rot.x += r < 0.3 ? 0.7 - 1.6 * strike : -0.9 * strike;
					rot.y += strike * 0.5;
					pos.x -= strike * 0.12;
					pos.z -= strike * 0.12;
				}
				break;
			}
			case 'reload': {
				const gun = def.firearm;
				if (!gun) break;
				const t = w.time / gun.reloadTime;
				const dip = Math.sin(Math.min(1, t) * Math.PI);
				pos.y -= dip * 0.1;
				rot.z += dip * 0.6;
				rot.x += dip * 0.3;
				break;
			}
			case 'throw': {
				const spec = def.throwable;
				if (!spec) break;
				const t = w.time / spec.duration;
				const back = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.25);
				rot.x += back * 0.9;
				pos.y += back * 0.1;
				pos.z += back * 0.1 - (t > 0.4 ? (1 - back) * 0.2 : 0);
				break;
			}
		}
		// Recoil: kick up and back, by the gun's `recoil`.
		rot.x += this.kick * this.kick * recoil.rise;
		pos.z += this.kick * recoil.back;

		// The viewmodel camera never moves, so camera space is world space here.
		this.root.position.copy(pos);
		this.root.rotation.copy(rot);
	}

	/**
	 * How far aiming has narrowed the view: 1 normally, down to the held gun's `zoom` when fully
	 * aimed, eased in and out with the gun coming up to the eye. 1 when no gun is drawn here.
	 */
	zoom(): number {
		const gun = this.item ? ITEMS[this.item]?.firearm : undefined;
		if (!gun || !this.root.visible) return 1;
		return 1 + (gun.zoom - 1) * this.aim;
	}

	/**
	 * Your own shot: the flare at the barrel's end, and the gun lit by it. Returns false when
	 * nothing is drawn (third person, map view), so the caller draws the flare in the world.
	 */
	flash(heavy: boolean): boolean {
		if (!this.root.visible || !this.model) return false;
		this.flashLeft = FLASH_TIME;
		this.flare.fire((heavy ? 0.42 : 0.3) * Math.sqrt(flashStrength()), 0.055);
		return true;
	}

	/** Where the muzzle is in the game world, for the flash: just in front of the player's eyes. */
	static muzzle(head: THREE.Object3D, target: THREE.Vector3): THREE.Vector3 {
		return target.set(0.12, -0.1, -0.7).applyMatrix4(head.matrixWorld);
	}

	dispose(): void {
		this.setItem(null);
		this.flare.dispose();
		this.camera.remove(this.fill);
		this.scene.remove(this.root, this.ambient);
	}

	private setItem(id: string | null): void {
		this.item = id;
		if (this.model) this.pivot.remove(this.model);
		this.model = null;
		const def = id ? ITEMS[id] : undefined;
		if (!def) return;
		// The flare sits at the barrel's end (in the model's space, scaled with it).
		const [mx, my, mz] = def.hold.muzzle ?? [0, 0, -0.25];
		this.flare.mesh.position.set(mx, my, mz - 0.03).multiplyScalar(def.hold.scale);
		const token = ++this.loading;
		const ready = (model: THREE.Object3D) => {
			if (token !== this.loading) return;
			model.scale.setScalar(def.hold.scale);
			model.traverse((node) => {
				if (node instanceof THREE.Mesh) {
					node.castShadow = false;
					node.receiveShadow = false;
					node.frustumCulled = false;
				}
			});
			this.model = model;
			this.pivot.add(model);
		};
		if (def.model) void loadModel(def.model).then(ready, () => ready(placeholder()));
		else ready(placeholder());
	}
}

function placeholder(): THREE.Object3D {
	return new THREE.Mesh(
		new THREE.BoxGeometry(0.04, 0.04, 0.2),
		new THREE.MeshStandardMaterial({ color: 0x555555 })
	);
}

function easeOut(t: number): number {
	return 1 - (1 - t) * (1 - t);
}
