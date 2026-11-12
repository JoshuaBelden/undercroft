import * as THREE from 'three';
import { CREATURES, type CreatureAnim, type CreatureDef } from '#lib/content/creatures.ts';
import { Animator } from '#lib/game/Animator.ts';
import { loadCharacter } from '#lib/game/assets.ts';
import type { SoundHandle } from '#lib/game/audio/AudioManager.ts';
import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import type { CreatureSnapshot, CreatureState } from '#lib/shared/creature/types.ts';
import { creatureLight, halfLightVisible } from '#lib/shared/creature/visibility.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { Vec3 } from '#lib/shared/map/types.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

interface Entry {
	def: CreatureDef;
	root: THREE.Group;
	model: THREE.Object3D | null;
	materials: THREE.Material[];
	animator: Animator | null;
	/** The snapshot state the animator was last sent to. */
	played: CreatureAnim | null;
	anim: CreatureAnim;
	animTime: number;
	state: CreatureState;
	target: THREE.Vector3;
	yaw: number;
	/** 0..1, eased toward 1 while visible (in its light band). */
	opacity: number;
	marker: THREE.Mesh;
	stepTimer: number;
	/** 0..1, set to 1 on a hit and eased out: a jolt backwards. */
	flinch: number;
	/** performance.now() when its burst (jump scare) sound last played. */
	burstSoundAt: number;
}

/**
 * Seconds between one creature's burst sounds. A stalking creature bursts every few seconds, and
 * the jump scare is long: it would never stop.
 */
const BURST_SOUND_GAP = 8;

/** Seconds between creature footstep sounds per animation state (none while still). */
const STEP_INTERVAL: Partial<Record<CreatureAnim, number>> = {
	crawl: 1.1,
	crouch: 0.95,
	walking: 0.7,
	running: 0.2
};
const ATTACKS: ReadonlySet<CreatureAnim> = new Set([
	'melee_attack',
	'weapon_attack',
	'spell_attack'
]);
const FADE_IN = 10;
const FADE_OUT = 5;
/** Seconds a dead creature takes to fade out before the server removes it. */
const CORPSE_FADE = 1.5;
/** Admin marker colour by AI state: patrolling, looking into something, chasing. */
const MARKER_COLOURS: Record<CreatureState, number> = {
	patrol: 0x9a9a9a,
	alert: 0xffb020,
	investigate: 0xffb020,
	agro: 0xff3030,
	attack: 0xff3030,
	dead: 0x404040
};
/** How quickly (1/s) the breathing loop's volume follows the nearest creature. */
const BREATH_EASE = 4;

/**
 * Creatures, drawn from server snapshots. Each one is visible only in its light band, computed here
 * from every player's lamp with the same shared function the server uses, so all clients agree
 * on what can be seen. Its sounds play regardless: you hear what you can't see.
 * See docs/dev/creatures.md.
 */
export class Creatures {
	readonly root = new THREE.Group();
	private entries = new Map<string, Entry>();
	private showMarkers = false;
	private markerGeometry = new THREE.SphereGeometry(0.25, 8, 6);
	private markerMaterials = new Map<CreatureState, THREE.MeshBasicMaterial>();
	private breath: SoundHandle | null = null;
	private breathStarting = false;
	private breathLevel = 0;

	constructor(private sounds: SoundBank) {
		this.root.name = 'creatures';
	}

	/** Admin: draw a marker on every creature, through walls. */
	setMarkers(enabled: boolean): void {
		this.showMarkers = enabled;
		for (const entry of this.entries.values()) entry.marker.visible = enabled;
	}

	apply(snapshots: CreatureSnapshot[]): void {
		const seen = new Set<string>();
		for (const snap of snapshots) {
			const def = CREATURES[snap.kind];
			if (!def) continue;
			seen.add(snap.id);
			let entry = this.entries.get(snap.id);
			if (!entry) {
				entry = this.create(def, snap);
				this.entries.set(snap.id, entry);
			}
			entry.target.set(...snap.position);
			entry.yaw = snap.yaw;
			if (snap.anim !== entry.anim) this.onAnim(entry, snap.anim);
			entry.anim = snap.anim;
			entry.animTime = snap.animTime;
			if (snap.state !== entry.state) {
				entry.state = snap.state;
				entry.marker.material = this.markerMaterial(snap.state);
			}
		}
		for (const [id, entry] of this.entries) {
			if (seen.has(id)) continue;
			this.remove(entry);
			this.entries.delete(id);
		}
	}

	clear(): void {
		this.apply([]);
		this.breathLevel = 0;
		this.breath?.setVolume(0);
	}

	/** Per frame: move, animate, and work out who can be seen. */
	update(delta: number, world: CollisionWorld | null, lamps: PlayerState[]): void {
		const t = Math.min(1, delta * 10);
		for (const entry of this.entries.values()) {
			const { root } = entry;
			root.position.lerp(entry.target, t);
			let dyaw = entry.yaw - root.rotation.y;
			dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
			root.rotation.y += dyaw * t;
			// A hit jolts it back for a moment.
			entry.flinch = Math.max(0, entry.flinch - delta * 5);
			if (entry.model) {
				entry.model.position.z = -entry.flinch * 0.12;
				entry.model.rotation.x = -entry.flinch * 0.2;
			}

			const position: [number, number, number] = [
				root.position.x,
				root.position.y,
				root.position.z
			];
			const light = creatureLight(world, lamps, position, entry.def.height);
			// The dead fade away before they're removed.
			const fading = entry.anim === 'die' && entry.animTime > entry.def.corpseTime - CORPSE_FADE;
			const visible = !fading && halfLightVisible(light, entry.def.visibleBand);
			const rate = visible ? FADE_IN : FADE_OUT;
			entry.opacity += ((visible ? 1 : 0) - entry.opacity) * Math.min(1, delta * rate);
			if (entry.opacity < 0.02) entry.opacity = 0;
			this.applyOpacity(entry);

			this.play(entry);
			entry.animator?.update(delta);
			this.footsteps(entry, delta, position);
		}
	}

	/**
	 * Per frame, from where the local player hears: a creature close by is heard breathing, louder
	 * the closer it is, through walls and whether it can be seen or not.
	 */
	listen(delta: number, listener: Vec3): void {
		let level = 0;
		for (const entry of this.entries.values()) {
			if (entry.state === 'dead') continue;
			const p = entry.root.position;
			const d = Math.hypot(listener[0] - p.x, listener[1] - p.y - 1.4, listener[2] - p.z);
			level = Math.max(level, Math.max(0, 1 - d / entry.def.breath.range) ** 2);
		}
		this.breathLevel += (level - this.breathLevel) * Math.min(1, delta * BREATH_EASE);
		if (this.breathLevel < 0.005) this.breathLevel = 0;
		if (this.breathLevel > 0 && !this.breath && !this.breathStarting) {
			this.breathStarting = true;
			void this.sounds.loop('creature.breath').then((handle) => (this.breath = handle));
		}
		this.breath?.setVolume(this.breathLevel);
	}

	dispose(): void {
		for (const entry of this.entries.values()) this.remove(entry);
		this.entries.clear();
		this.markerGeometry.dispose();
		for (const material of this.markerMaterials.values()) material.dispose();
		this.markerMaterials.clear();
		this.breath?.stop();
		this.breath = null;
	}

	private markerMaterial(state: CreatureState): THREE.MeshBasicMaterial {
		let material = this.markerMaterials.get(state);
		if (!material) {
			material = new THREE.MeshBasicMaterial({
				color: MARKER_COLOURS[state],
				wireframe: true,
				depthTest: false,
				transparent: true
			});
			this.markerMaterials.set(state, material);
		}
		return material;
	}

	private create(def: CreatureDef, snap: CreatureSnapshot): Entry {
		const root = new THREE.Group();
		root.name = `creature-${snap.id}`;
		root.position.set(...snap.position);
		root.rotation.y = snap.yaw;
		const marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial(snap.state));
		marker.position.y = def.height;
		marker.renderOrder = 10;
		marker.visible = this.showMarkers;
		root.add(marker);
		this.root.add(root);
		const entry: Entry = {
			def,
			root,
			model: null,
			materials: [],
			animator: null,
			played: null,
			anim: snap.anim,
			animTime: snap.animTime,
			state: snap.state,
			target: new THREE.Vector3(...snap.position),
			yaw: snap.yaw,
			opacity: 0,
			marker,
			stepTimer: 0,
			flinch: 0,
			burstSoundAt: -Infinity
		};
		void loadCharacter(def.model).then(({ scene, clips }) => {
			if (!root.parent) return;
			scene.rotation.y = def.yawOffset;
			scene.traverse((node) => {
				if (!(node instanceof THREE.Mesh)) return;
				// Own materials so fading one creature doesn't fade the others.
				const list = Array.isArray(node.material) ? node.material : [node.material];
				const owned = list.map((m: THREE.Material) => m.clone());
				node.material = Array.isArray(node.material) ? owned : owned[0];
				entry.materials.push(...owned);
				node.castShadow = true;
				node.frustumCulled = false;
			});
			root.add(scene);
			entry.model = scene;
			entry.animator = new Animator(scene, clips, def.animations);
			// Attack clips are stretched to the attack's duration so the hit lines up.
			for (const anim of ATTACKS) entry.animator.setDuration(anim, def.attack.duration);
			this.applyOpacity(entry);
		});
		return entry;
	}

	private remove(entry: Entry): void {
		entry.animator?.dispose();
		for (const material of entry.materials) material.dispose();
		entry.root.removeFromParent();
	}

	/** Send the animator to the snapshot's state, picking up where the server is in it. */
	private play(entry: Entry): void {
		if (!entry.animator || entry.played === entry.anim) return;
		entry.played = entry.anim;
		entry.animator.play(entry.anim, entry.animTime);
	}

	private applyOpacity(entry: Entry): void {
		if (!entry.model) return;
		entry.model.visible = entry.opacity > 0;
		const solid = entry.opacity >= 0.99;
		for (const material of entry.materials) {
			if (material.transparent === solid) {
				material.transparent = !solid;
				material.needsUpdate = true;
			}
			material.opacity = entry.opacity;
			material.depthWrite = solid;
		}
	}

	/** A creature was hit: flinch. */
	hit(id: string): void {
		const entry = this.entries.get(id);
		if (entry) entry.flinch = 1;
	}

	private onAnim(entry: Entry, anim: CreatureAnim): void {
		const at: [number, number, number] = [entry.target.x, entry.target.y + 1, entry.target.z];
		const now = performance.now();
		if (anim === entry.def.gait.burst && now - entry.burstSoundAt > BURST_SOUND_GAP * 1000) {
			this.sounds.playAt('creature.burst', at, 1, 3);
			entry.burstSoundAt = now;
		}
		if (ATTACKS.has(anim)) this.sounds.playAt('creature.attack', at, 1, 3);
		entry.stepTimer = 0;
	}

	private footsteps(entry: Entry, delta: number, position: [number, number, number]): void {
		const interval = STEP_INTERVAL[entry.anim];
		if (!interval) return;
		entry.stepTimer -= delta;
		if (entry.stepTimer > 0) return;
		entry.stepTimer = interval * (0.85 + Math.random() * 0.3);
		this.sounds.playAt('creature.step', [position[0], position[1] + 0.1, position[2]], 1, 2);
	}
}
