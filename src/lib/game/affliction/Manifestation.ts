import * as THREE from 'three';
import type { AnimSlot } from '#lib/content/animations.ts';
import type { ManifestationBody, ManifestationSpec } from '#lib/content/afflictions.ts';
import { Animator } from '#lib/game/Animator.ts';
import { loadCharacter } from '#lib/game/assets.ts';
import type { SoundHandle } from '#lib/game/audio/AudioManager.ts';
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

/** Metres at which its presence rumble fades out. */
const HEARD_FROM = 28;
/** Seconds it takes to fade away when banished. */
const DISSOLVE = 3;
/** Seconds it takes to appear when it manifests. */
const APPEAR = 3;
/** Below this speed (m/s) it stands. */
const STILL = 0.15;

/**
 * An Affliction's manifestation: the figure that comes for the players when the meter fills
 * (the manifestation's `body`). It walks where the server moves it, strikes when its touch
 * lands, reels when it's hit, hisses when light exposes it, and falls when banished. A low
 * rumble tells you it's near. The server simulates a point with a hit capsule; the figure is
 * drawn here only. See docs/dev/affliction.md.
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
	private presence: SoundHandle | null = null;
	private presenceStarting = false;

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
			this.strikes = snap.strikes;
		}
		if (snap.strikes > this.strikes) this.striking = this.spec?.body?.strikeSeconds ?? 0;
		this.strikes = snap.strikes;
		if (snap.exposed && !this.exposed) {
			this.sounds.playAt('manifest.hiss', this.corePoint(), 1, 4);
		}
		if (snap.state === 'banished' && this.state !== 'banished') {
			this.sounds.playAt('manifest.banish', this.corePoint(), 1, 8);
		}
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
		this.presence?.setVolume(0);
	}

	update(delta: number, listener: Vec3): void {
		if (!this.active) return;
		this.root.position.lerp(this.target, Math.min(1, delta * 6));
		if (this.state === 'banished') this.dissolve = Math.min(1, this.dissolve + delta / DISSOLVE);
		this.updateFigure(delta);
		if (this.dissolve >= 1) this.clear();

		// Presence rumble, louder the closer it is.
		if (!this.presence && !this.presenceStarting) {
			this.presenceStarting = true;
			void this.sounds.loop('manifest.presence').then((handle) => (this.presence = handle));
		}
		const p = this.root.position;
		const d = Math.hypot(listener[0] - p.x, listener[1] - p.y - 1, listener[2] - p.z);
		const level = Math.max(0, 1 - d / HEARD_FROM) ** 2 * (1 - this.dissolve);
		this.presence?.setVolume(level);
		this.presence?.setRate(this.exposed ? 1.15 : 1);
	}

	dispose(): void {
		this.figureModel = null;
		this.figure?.animator.dispose();
		for (const material of this.figure?.materials ?? []) material.dispose();
		this.figure = null;
		this.presence?.stop();
		this.presence = null;
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
		if (this.state === 'banished') {
			anim = 'die';
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
		}
	}

	private corePoint(): Vec3 {
		return [this.root.position.x, this.root.position.y + 1.1, this.root.position.z];
	}
}
