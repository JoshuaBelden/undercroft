import * as THREE from 'three';
import {
	CREATURE_ANIMS,
	CREATURES,
	LOOPING_ANIMS,
	resolveAnim,
	type CreatureAnim,
	type CreatureDef
} from '#lib/content/creatures.ts';
import { loadCreature } from '#lib/game/assets.ts';
import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import type { CreatureSnapshot } from '#lib/shared/creature/types.ts';
import { creatureLight, halfLightVisible } from '#lib/shared/creature/visibility.ts';
import type { CollisionWorld } from '#lib/shared/map/collision.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

interface Entry {
	def: CreatureDef;
	root: THREE.Group;
	model: THREE.Object3D | null;
	materials: THREE.Material[];
	mixer: THREE.AnimationMixer | null;
	/** One action per slot the model has a clip for. */
	actions: Partial<Record<CreatureAnim, THREE.AnimationAction>>;
	playing: THREE.AnimationAction | null;
	/** The snapshot state `playing` was started for. */
	played: CreatureAnim | null;
	anim: CreatureAnim;
	animTime: number;
	target: THREE.Vector3;
	yaw: number;
	/** 0..1, eased toward 1 while in half-light. */
	opacity: number;
	marker: THREE.Mesh;
	stepTimer: number;
	/** 0..1, set to 1 on a hit and eased out: a jolt backwards. */
	flinch: number;
}

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
const CROSSFADE = 0.25;
/** Seconds a dead creature takes to fade out before the server removes it. */
const CORPSE_FADE = 1.5;

/**
 * Creatures, drawn from server snapshots. Each one is visible only in half-light, computed here
 * from every player's lamp with the same shared function the server uses, so all clients agree
 * on what can be seen. Its sounds play regardless: you hear what you can't see.
 * See docs/dev/creatures.md.
 */
export class Creatures {
	readonly root = new THREE.Group();
	private entries = new Map<string, Entry>();
	private showMarkers = false;
	private markerGeometry = new THREE.SphereGeometry(0.25, 8, 6);
	private markerMaterial = new THREE.MeshBasicMaterial({
		color: 0xff3030,
		wireframe: true,
		depthTest: false,
		transparent: true
	});

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
		}
		for (const [id, entry] of this.entries) {
			if (seen.has(id)) continue;
			this.remove(entry);
			this.entries.delete(id);
		}
	}

	clear(): void {
		this.apply([]);
	}

	/** Per frame: move, animate, and work out who's in half-light. */
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
			entry.mixer?.update(delta);
			this.footsteps(entry, delta, position);
		}
	}

	dispose(): void {
		for (const entry of this.entries.values()) this.remove(entry);
		this.entries.clear();
		this.markerGeometry.dispose();
		this.markerMaterial.dispose();
	}

	private create(def: CreatureDef, snap: CreatureSnapshot): Entry {
		const root = new THREE.Group();
		root.name = `creature-${snap.id}`;
		root.position.set(...snap.position);
		root.rotation.y = snap.yaw;
		const marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
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
			mixer: null,
			actions: {},
			playing: null,
			played: null,
			anim: snap.anim,
			animTime: snap.animTime,
			target: new THREE.Vector3(...snap.position),
			yaw: snap.yaw,
			opacity: 0,
			marker,
			stepTimer: 0,
			flinch: 0
		};
		void loadCreature(def.model).then(({ scene, clips }) => {
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
			entry.mixer = new THREE.AnimationMixer(scene);
			for (const anim of CREATURE_ANIMS) {
				const spec = def.animations[anim];
				const clip = spec && clips.find((c) => c.name === spec.clip);
				if (!spec || !clip) continue;
				const loop = LOOPING_ANIMS.has(anim);
				const action = entry.mixer.clipAction(clip);
				action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
				action.clampWhenFinished = !loop;
				// Attack clips are stretched to the attack's duration so the hit lines up.
				action.timeScale = ATTACKS.has(anim)
					? (clip.duration - (spec.start ?? 0)) / def.attack.duration
					: (spec.speed ?? 1);
				entry.actions[anim] = action;
			}
			this.applyOpacity(entry);
		});
		return entry;
	}

	private remove(entry: Entry): void {
		entry.mixer?.stopAllAction();
		for (const material of entry.materials) material.dispose();
		entry.root.removeFromParent();
	}

	/** Crossfade to the snapshot's animation state, or the nearest one the model has a clip for. */
	private play(entry: Entry): void {
		if (!entry.mixer || entry.played === entry.anim) return;
		entry.played = entry.anim;
		const slot = resolveAnim(entry.def.animations, entry.anim);
		const next = slot ? entry.actions[slot] : undefined;
		// Nothing to play for this state (or it's already playing): carry on as we were.
		if (!slot || !next || next === entry.playing) return;
		const previous = entry.playing;
		const duration = next.getClip().duration;
		// Pick up where the server is in the state, so one-shot clips stay in step.
		const time = (entry.def.animations[slot]?.start ?? 0) + entry.animTime * next.timeScale;
		next.reset();
		next.time = LOOPING_ANIMS.has(slot) ? time % duration : Math.min(time, duration);
		next.play();
		if (previous) next.crossFadeFrom(previous, CROSSFADE, false);
		entry.playing = next;
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
		if (anim === entry.def.gait.burst) this.sounds.playAt('creature.burst', at, 1, 3);
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
