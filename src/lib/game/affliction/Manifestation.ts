import * as THREE from 'three';
import type { AnimSlot } from '#lib/content/animations.ts';
import type { ManifestationBody, ManifestationSpec } from '#lib/content/afflictions.ts';
import { Animator } from '#lib/game/Animator.ts';
import { loadCharacter } from '#lib/game/assets.ts';
import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import { RayEffects } from './RayEffects.ts';
import type { ManifestationSnapshot } from '#lib/shared/affliction/types.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';

/** The figure, once its model has loaded. */
interface Figure {
	def: ManifestationBody;
	scene: THREE.Object3D;
	materials: THREE.Material[];
	animator: Animator;
	/** Its hand bones, where the ray gathers. */
	hands: THREE.Object3D[];
}

/** Seconds it takes to fade away when banished. */
const DISSOLVE = 3;
/** Seconds it takes to appear when it manifests. */
const APPEAR = 3;
/** Below this speed (m/s) it stands. */
const STILL = 0.15;
/** Seconds it takes to go when it vanishes, and to come back. */
const VANISH = 0.6;
/** Where its hands are when it has no figure to find them on: ahead of it, chest high (m). */
const HANDS_AHEAD = 0.55;
const HANDS_UP = 1.45;
const scratch = new THREE.Vector3();
/** Seconds into the stun when it stops reeling and stands frozen. */
const STUN_REEL = 0.35;

/**
 * An Affliction's manifestation: the figure the rite summons (the manifestation's `body`). It
 * walks where the server moves it and charges when it runs someone down, winds up and strikes,
 * gathers its ray at its hands and fires it (RayEffects), reels when it's hit, stands frozen when
 * a strobe stuns it, fades out when it vanishes and back in where it returns, and falls when
 * banished. The fight music (play/affliction) says it's here. The server simulates a point with a
 * hit capsule; the figure is drawn here only. See docs/dev/affliction.md.
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
	/** 0..1: how far it has faded out, vanishing (back to 0 as it returns). */
	private gone = 0;
	private casts = 0;
	/** 0..1, the ray it is gathering (from the snapshot), and where it aims it. */
	private charge = 0;
	private aim: THREE.Vector3 | null = null;
	/** Seconds left of the cast animation. */
	private casting = 0;
	private rushing = false;
	/** Its ray: the charge at its hands and the ray once fired. In world space, beside the figure. */
	readonly ray = new RayEffects();
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
			this.gone = snap.state === 'vanished' ? 1 : 0;
			this.stunned = false;
			this.strikes = snap.strikes;
			this.casts = snap.casts;
			this.casting = 0;
			this.rushing = snap.rushing;
		}
		if (snap.state === 'vanished' && this.state !== 'vanished') {
			this.sounds.playAt('manifest.vanish', this.corePoint(), 1, 6);
		} else if (snap.state !== 'vanished' && this.state === 'vanished') {
			// Back from somewhere else: it is there at once, not walked over from where it went.
			this.root.position.copy(this.target);
			this.last.copy(this.target);
			this.sounds.playAt('manifest.return', this.corePoint(), 1, 6);
		}
		if (snap.casts > this.casts) {
			// It gathers its ray: seen at its hands and heard building before it strikes.
			this.casting = this.spec?.ray.chargeSeconds ?? 0;
			this.striking = 0;
			this.sounds.playAt('manifest.cast', this.corePoint(), 1, 6);
		}
		this.casts = snap.casts;
		this.charge = snap.charge;
		this.aim = snap.aim ? (this.aim ?? new THREE.Vector3()).set(...snap.aim) : null;
		if (snap.rushing && !this.rushing) this.sounds.playAt('manifest.rush', this.corePoint(), 1, 6);
		this.rushing = snap.rushing;
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
			this.casting = 0;
		}
		this.stunned = snap.stunned;
		this.state = snap.state;
	}

	/** A weapon hit it: it reels. */
	hit(): void {
		this.flinching = this.spec?.body?.flinchSeconds ?? 0;
	}

	/** Its ray struck, from its core (`from`, the server's) to `to`: drawn from its hands. */
	fire(from: Vec3, to: Vec3): void {
		this.casting = Math.min(this.casting, 0.25);
		this.charge = 0;
		const start = this.active ? this.hands(scratch) : scratch.set(...from);
		this.ray.fire(start.clone(), new THREE.Vector3(...to));
	}

	clear(): void {
		this.active = false;
		this.root.visible = false;
		this.ray.clear();
	}

	update(delta: number): void {
		this.ray.update(delta);
		if (!this.active) return;
		this.root.position.lerp(this.target, Math.min(1, delta * 6));
		if (this.state === 'banished') this.dissolve = Math.min(1, this.dissolve + delta / DISSOLVE);
		const going = this.state === 'vanished' ? 1 : -1;
		this.gone = Math.max(0, Math.min(1, this.gone + (going * delta) / VANISH));
		this.updateFigure(delta);
		const charging = this.charge > 0 && this.state === 'hunting' && !this.stunned;
		this.ray.charge(this.hands(scratch), charging ? this.charge : 0);
		if (this.dissolve >= 1) this.clear();
	}

	dispose(): void {
		this.figureModel = null;
		this.figure?.animator.dispose();
		for (const material of this.figure?.materials ?? []) material.dispose();
		this.figure = null;
		this.ray.dispose();
		this.root.clear();
	}

	/** Where its hands are (world space): between its two hand bones, or a guess without them. */
	private hands(out: THREE.Vector3): THREE.Vector3 {
		const bones = this.figure?.hands;
		if (bones && bones.length === 2) {
			const a = bones[0].getWorldPosition(new THREE.Vector3());
			return out.copy(bones[1].getWorldPosition(new THREE.Vector3())).add(a).multiplyScalar(0.5);
		}
		const yaw = this.root.rotation.y;
		return out.set(
			this.root.position.x - Math.sin(yaw) * HANDS_AHEAD,
			this.root.position.y + HANDS_UP,
			this.root.position.z - Math.cos(yaw) * HANDS_AHEAD
		);
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
			if (this.spec) animator.setDuration('spell_attack', this.spec.ray.chargeSeconds);
			const hands = ['LeftHand', 'RightHand']
				.map((name) => scene.getObjectByName(`mixamorig${name}`))
				.filter((bone): bone is THREE.Object3D => !!bone);
			this.root.add(scene);
			this.figure = { def, scene, materials, animator, hands };
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
		// Facing: toward the aim while it gathers its ray, else the way it's going.
		let face: number | null = null;
		if (this.aim && this.charge > 0) {
			face = Math.atan2(-(this.aim.x - p.x), -(this.aim.z - p.z));
		} else if (moved > 1e-4 && this.state === 'hunting') {
			face = Math.atan2(-dx, -dz);
		}
		if (face !== null) {
			const turn = face - this.root.rotation.y;
			this.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, delta * 8);
		}
		// A strike that has just begun (this frame) starts the swing, even straight after another.
		const begun = this.striking > 0 && this.striking === this.spec?.body?.strikeSeconds;
		const castBegun = this.casting > 0 && this.casting === this.spec?.ray.chargeSeconds;
		this.striking = Math.max(0, this.striking - delta);
		this.casting = Math.max(0, this.casting - delta);
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
		} else if (this.casting > 0) {
			anim = 'spell_attack';
		} else if (this.flinching > 0) {
			anim = 'take_damage';
		} else if (this.state === 'hunting' && this.speed > STILL && spec) {
			// Running someone down, it charges; otherwise it walks, quicker unlit.
			anim = this.rushing ? 'running' : 'walking';
			const pace = this.rushing ? spec.rush.speed : spec.speed;
			rate = Math.max(0.3, Math.min(1.6, this.speed / pace));
		}
		figure.animator.play(anim, 0, begun || (anim === 'spell_attack' && castBegun));
		figure.animator.setRate(rate);
		figure.animator.update(delta);

		const opacity = Math.min(1, this.age / APPEAR) * (1 - this.dissolve) * (1 - this.gone);
		const solid = opacity >= 0.99;
		figure.scene.visible = opacity > 0.01;
		for (const material of figure.materials) {
			if (material.transparent === solid) {
				material.transparent = !solid;
				material.needsUpdate = true;
			}
			material.opacity = opacity;
			material.depthWrite = solid;
		}
	}

	private corePoint(): Vec3 {
		return [this.root.position.x, this.root.position.y + 1.1, this.root.position.z];
	}
}
