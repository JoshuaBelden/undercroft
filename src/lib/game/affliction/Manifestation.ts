import * as THREE from 'three';
import type { AnimSlot } from '#lib/content/animations.ts';
import type { ManifestationBody, ManifestationSpec } from '#lib/content/afflictions.ts';
import { Animator } from '#lib/game/Animator.ts';
import { loadCharacter } from '#lib/game/assets.ts';
import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import type { ManifestationSnapshot } from '#lib/shared/affliction/types.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';

/** The figure, once its model has loaded. */
interface Figure {
	def: ManifestationBody;
	scene: THREE.Object3D;
	materials: THREE.Material[];
	animator: Animator;
}

/** Seconds it takes to fade away when banished. */
const DISSOLVE = 3;
/** Seconds it takes to appear when it manifests. */
const APPEAR = 3;
/** Below this speed (m/s) it stands. */
const STILL = 0.15;
/** The colour it burns with as lamp light takes hold of it. */
const BURN = new THREE.Color(0xffd9a0);
/** Emissive strength while light builds on it, and while it is exposed (pulsing about this). */
const BURN_CHARGE = 0.35;
const BURN_EXPOSED = 0.9;
/** Seconds into the stun when it stops reeling and stands frozen. */
const STUN_REEL = 0.35;

/**
 * An Affliction's manifestation: the figure the rite summons (the manifestation's `body`). It
 * walks where the server moves it, winds up and strikes, reels when it's hit, burns brighter as
 * lamp light takes hold of it and flares when that exposes it, stands frozen when a strobe stuns
 * it, and falls when banished. The fight music (play/affliction) says it's here. The server
 * simulates a point with a hit capsule; the figure is drawn here only. See
 * docs/dev/affliction.md.
 */
export class Manifestation {
	readonly root = new THREE.Group();
	private figure: Figure | null = null;
	/** Model being (or already) loaded, so a later snapshot doesn't load it again. */
	private figureModel: string | null = null;
	private spec: ManifestationSpec | null = null;
	private target = new THREE.Vector3();
	private last = new THREE.Vector3();
	private active = false;
	private state: ManifestationSnapshot['state'] = 'gathering';
	private exposed = false;
	/** 0..1, how near lamp light is to exposing it (1 while exposed); smoothed for the burn. */
	private charge = 0;
	private burn = 0;
	private stunned = false;
	/** Seconds it has been stunned. */
	private stunTime = 0;
	private strikes = 0;
	/** Seconds left of the strike and flinch animations. */
	private striking = 0;
	private flinching = 0;
	/** Seconds since it appeared. */
	private age = 0;
	/** 0..1 while it fades away, banished. */
	private dissolve = 0;
	/** Smoothed ground speed (m/s), from how it moves between frames. */
	private speed = 0;

	constructor(private sounds: SoundBank) {
		this.root.name = 'manifestation';
		this.root.visible = false;
	}

	/** `spec` is the Affliction's manifestation data: its body and its speeds. */
	apply(snap: ManifestationSnapshot | null, spec: ManifestationSpec | null = null): void {
		if (!snap) {
			if (this.active && this.state !== 'banished') this.clear();
			return;
		}
		if (spec) {
			this.spec = spec;
			if (spec.body && spec.body.model !== this.figureModel) this.loadFigure(spec.body);
		}
		this.target.set(...snap.position);
		if (!this.active) {
			this.active = true;
			this.root.position.copy(this.target);
			this.last.copy(this.target);
			this.root.visible = true;
			this.dissolve = 0;
			this.age = 0;
			this.speed = 0;
			this.striking = 0;
			this.flinching = 0;
			this.burn = 0;
			this.stunned = false;
			this.strikes = snap.strikes;
		}
		if (snap.strikes > this.strikes) {
			// A swing begins: the wind-up is heard before the blow lands.
			this.striking = this.spec?.body?.strikeSeconds ?? 0;
			this.sounds.playAt('manifest.windup', this.corePoint(), 1, 5);
		}
		this.strikes = snap.strikes;
		if (snap.stunned && !this.stunned) {
			this.sounds.playAt('manifest.stun', this.corePoint(), 1, 6);
			this.stunTime = 0;
			this.striking = 0;
		}
		this.stunned = snap.stunned;
		this.charge = snap.charge;
		this.exposed = snap.exposed;
		this.state = snap.state;
	}

	/** A weapon hit it: it reels. */
	hit(): void {
		this.flinching = this.spec?.body?.flinchSeconds ?? 0;
	}

	clear(): void {
		this.active = false;
		this.root.visible = false;
	}

	update(delta: number): void {
		if (!this.active) return;
		this.root.position.lerp(this.target, Math.min(1, delta * 6));
		if (this.state === 'banished') this.dissolve = Math.min(1, this.dissolve + delta / DISSOLVE);
		this.updateFigure(delta);
		if (this.dissolve >= 1) this.clear();
	}

	dispose(): void {
		this.figureModel = null;
		this.figure?.animator.dispose();
		for (const material of this.figure?.materials ?? []) material.dispose();
		this.figure = null;
		this.root.clear();
	}

	private loadFigure(def: ManifestationBody): void {
		this.figureModel = def.model;
		void loadCharacter(def.model).then(({ scene, clips }) => {
			if (this.figureModel !== def.model) return;
			scene.rotation.y = def.yawOffset;
			scene.scale.setScalar(def.scale);
			const materials: THREE.Material[] = [];
			scene.traverse((node) => {
				if (!(node instanceof THREE.Mesh)) return;
				// Own materials: it fades in and out.
				const list = Array.isArray(node.material) ? node.material : [node.material];
				const owned = list.map((m: THREE.Material) => m.clone());
				node.material = Array.isArray(node.material) ? owned : owned[0];
				materials.push(...owned);
				node.castShadow = true;
				node.frustumCulled = false;
			});
			const animator = new Animator(scene, clips, def.animations);
			animator.setDuration('melee_attack', def.strikeSeconds);
			this.root.add(scene);
			this.figure = { def, scene, materials, animator };
		});
	}

	/** Turn it the way it's going, pick its animation, and fade it in or out. */
	private updateFigure(delta: number): void {
		this.age += delta;
		// Speed and heading from how it moved this frame: the snapshot has no yaw.
		const p = this.root.position;
		const dx = p.x - this.last.x;
		const dz = p.z - this.last.z;
		this.last.copy(p);
		const moved = Math.hypot(dx, dz);
		if (delta > 0) this.speed += (moved / delta - this.speed) * Math.min(1, delta * 5);
		if (moved > 1e-4 && this.state === 'hunting') {
			const turn = Math.atan2(-dx, -dz) - this.root.rotation.y;
			this.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, delta * 6);
		}
		// A strike that has just begun (this frame) starts the swing, even straight after another.
		const begun = this.striking > 0 && this.striking === this.spec?.body?.strikeSeconds;
		this.striking = Math.max(0, this.striking - delta);
		this.flinching = Math.max(0, this.flinching - delta);

		const figure = this.figure;
		if (!figure) return;
		const spec = this.spec;
		let anim: AnimSlot = 'idle';
		let rate = 1;
		if (this.stunned) this.stunTime += delta;
		if (this.state === 'banished') {
			anim = 'die';
		} else if (this.stunned) {
			// Reels from the flash, then stands frozen in it.
			anim = 'take_damage';
			if (this.stunTime > STUN_REEL) rate = 0;
		} else if (this.striking > 0) {
			anim = 'melee_attack';
		} else if (this.flinching > 0) {
			anim = 'take_damage';
		} else if (this.state === 'hunting' && this.speed > STILL && spec) {
			// Unlit, it comes on at a run.
			const running = this.speed > (spec.speed + spec.unlitSpeed) / 2;
			anim = running ? 'running' : 'walking';
			rate = Math.max(0.3, Math.min(1.5, this.speed / (running ? spec.unlitSpeed : spec.speed)));
		}
		figure.animator.play(anim, 0, begun);
		figure.animator.setRate(rate);
		figure.animator.update(delta);

		// It burns as lamp light takes hold of it, and flares, flickering, while exposed.
		const flicker = 0.8 + 0.2 * Math.sin(this.age * 23) * Math.sin(this.age * 7);
		const burn =
			this.state === 'banished'
				? 0
				: this.exposed
					? BURN_EXPOSED * flicker
					: this.charge * BURN_CHARGE;
		this.burn += (burn - this.burn) * Math.min(1, delta * 10);

		const opacity = Math.min(1, this.age / APPEAR) * (1 - this.dissolve);
		const solid = opacity >= 0.99;
		figure.scene.visible = opacity > 0.01;
		for (const material of figure.materials) {
			if (material.transparent === solid) {
				material.transparent = !solid;
				material.needsUpdate = true;
			}
			material.opacity = opacity;
			material.depthWrite = solid;
			if (material instanceof THREE.MeshStandardMaterial) {
				material.emissive.copy(BURN);
				material.emissiveIntensity = this.burn;
			}
		}
	}

	private corePoint(): Vec3 {
		return [this.root.position.x, this.root.position.y + 1.1, this.root.position.z];
	}
}
