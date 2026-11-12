import * as THREE from 'three';
import {
	ANIM_SLOTS,
	LOOPING_ANIMS,
	resolveAnim,
	type AnimSlot,
	type AnimationMap
} from '#lib/content/animations.ts';

const CROSSFADE = 0.25;
/** Frame rate used to cut a clip down to `start`..`end`. */
const FPS = 30;

/**
 * Plays a rigged model's clips by standard slot, through its animation map: one action per slot
 * the model has a clip for, crossfading between them. A slot the model lacks falls back to the
 * nearest one it has, or is skipped. See docs/dev/creatures.md (Animation maps).
 */
export class Animator {
	private mixer: THREE.AnimationMixer;
	private actions: Partial<Record<AnimSlot, THREE.AnimationAction>> = {};
	private speeds: Partial<Record<AnimSlot, number>> = {};
	/** The slot whose clip is playing (after fallbacks). */
	private playing: AnimSlot | null = null;
	private rate = 1;

	constructor(
		scene: THREE.Object3D,
		clips: THREE.AnimationClip[],
		private map: AnimationMap
	) {
		this.mixer = new THREE.AnimationMixer(scene);
		const used = new Set<THREE.AnimationClip>();
		for (const slot of ANIM_SLOTS) {
			const spec = map[slot];
			let clip = spec && clips.find((c) => c.name === spec.clip);
			if (!spec || !clip) continue;
			if (spec.start !== undefined || spec.end !== undefined) {
				const from = Math.round((spec.start ?? 0) * FPS);
				const to = Math.round((spec.end ?? clip.duration) * FPS);
				clip = THREE.AnimationUtils.subclip(clip, `${clip.name}:${slot}`, from, to, FPS);
			} else if (used.has(clip)) {
				// Two slots sharing a clip each need their own action.
				clip = clip.clone();
			}
			used.add(clip);
			const loop = LOOPING_ANIMS.has(slot);
			const action = this.mixer.clipAction(clip);
			action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
			action.clampWhenFinished = !loop;
			this.actions[slot] = action;
			this.speeds[slot] = spec.speed ?? 1;
		}
	}

	/** Stretch (or squeeze) a slot's clip to last this many seconds, instead of its map speed. */
	setDuration(slot: AnimSlot, seconds: number): void {
		const action = this.actions[slot];
		if (action && seconds > 0) this.speeds[slot] = action.getClip().duration / seconds;
	}

	/**
	 * Crossfade to a slot, or the nearest one the model has a clip for. `at` is how many seconds
	 * into it to start (to stay in step with the server). Asking for what is already playing does
	 * nothing unless `restart` is set.
	 */
	play(anim: AnimSlot, at = 0, restart = false): void {
		const slot = resolveAnim(this.map, anim);
		const next = slot ? this.actions[slot] : undefined;
		if (!slot || !next || (slot === this.playing && !restart)) return;
		const previous = this.playing ? this.actions[this.playing] : undefined;
		const speed = this.speeds[slot] ?? 1;
		const loop = LOOPING_ANIMS.has(slot);
		const duration = next.getClip().duration;
		next.reset();
		next.timeScale = loop ? speed * this.rate : speed;
		next.time = loop ? (at * speed) % duration : Math.min(at * speed, duration);
		next.play();
		if (previous && previous !== next) next.crossFadeFrom(previous, CROSSFADE, false);
		this.playing = slot;
	}

	/** Scale a looping clip's speed, so a walk keeps pace with the ground. 0 holds the pose. */
	setRate(rate: number): void {
		this.rate = rate;
		const slot = this.playing;
		const action = slot ? this.actions[slot] : undefined;
		if (slot && action && LOOPING_ANIMS.has(slot)) {
			action.timeScale = (this.speeds[slot] ?? 1) * rate;
		}
	}

	update(delta: number): void {
		this.mixer.update(delta);
	}

	dispose(): void {
		this.mixer.stopAllAction();
	}
}
