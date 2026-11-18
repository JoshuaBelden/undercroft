import * as THREE from 'three';
import type { AnimSlot } from '#lib/content/animations.ts';
import { ITEMS } from '#lib/content/items.ts';
import { CONDITIONS } from '#lib/content/player/conditions.ts';
import { CLIMB, FALL, MOVEMENT } from '#lib/content/player/movement.ts';
import { PLAYER_MODEL } from '#lib/content/player/model.ts';
import { Animator } from '#lib/game/Animator.ts';
import { loadCharacter } from '#lib/game/assets.ts';
import { itemModel } from '#lib/game/items/itemModel.ts';
import { UpperBody } from '#lib/game/UpperBody.ts';
import { held } from '#lib/shared/items/inventory.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import { upperBodyPose } from './pose.ts';

/** Below this speed (m/s) a standing player is idle. */
const STILL = 0.2;
/** Seconds after a fall that hurt that the fall clip plays on (about its length). */
const FALL_PLAY = 1.2;
/** How far a walk or run cycle may be slowed or hurried to match the ground speed. */
const RATE_RANGE: [number, number] = [0.4, 1.6];

/**
 * A player's body: the explorer model, animated from that player's state alone (stance, speed,
 * what the hand is doing), so it needs nothing extra from the server. Used for other players and
 * for yourself in the over-the-shoulder view. The owner places `root` at the feet.
 *
 * The legs (and the whole body, for a swing, a fall or a climb) play a full-body clip; over it
 * `UpperBody` poses the arms for what is in the hand (`upperBodyPose`), and the item's model
 * hangs from the right hand bone at its `grip`. See docs/dev/player.md (Player model).
 */
export class PlayerBody {
	readonly root = new THREE.Group();
	private animator: Animator | null = null;
	private upper: UpperBody | null = null;
	/** Hangs from the right hand bone at the held item's grip; holds its model. */
	private grip = new THREE.Group();
	private item: string | null = null;
	private model: THREE.Object3D | null = null;
	private loading = 0;
	/** Shots fired, as of last frame: when it changes, another shot has begun. */
	private shots = -1;
	private disposed = false;
	/** The hand action's clock last frame: when it goes back, a new swing has begun. */
	private actionTime = 0;

	constructor() {
		this.root.name = 'player-body';
		this.root.rotation.order = 'YXZ';
		void loadCharacter(PLAYER_MODEL.model).then(({ scene, clips }) => {
			if (this.disposed) return;
			scene.rotation.y = PLAYER_MODEL.yawOffset;
			scene.traverse((node) => {
				if (!(node instanceof THREE.Mesh)) return;
				// The headlamp sits inside the head: a body that cast shadows would block its own
				// lamp (shadow passes draw back faces), and layers can't exempt a single light.
				node.castShadow = false;
				node.frustumCulled = false;
			});
			this.root.add(scene);
			this.animator = new Animator(scene, clips, PLAYER_MODEL.animations);
			this.upper = new UpperBody(scene, clips, PLAYER_MODEL.upper);
			scene.getObjectByName(PLAYER_MODEL.hand)?.add(this.grip);
		});
		this.grip.name = 'held-item';
		this.grip.visible = false;
	}

	/** Face `yaw` and animate for this state. */
	update(delta: number, state: PlayerState, yaw: number): void {
		this.root.rotation.y = yaw;
		const animator = this.animator;
		if (!animator) return;
		this.full(delta, state, animator);
		const shot = state.weapon.action === 'shot' && state.weapon.shots !== this.shots;
		this.shots = state.weapon.shots;
		this.upper?.play(upperBodyPose(state), shot);
		this.upper?.apply(delta);
		this.hold(state);
	}

	/**
	 * Where the held gun's muzzle is in the world (its `hold.muzzle`), for the flare and smoke of
	 * a shot; null when no gun is drawn in the hand.
	 */
	muzzle(target: THREE.Vector3): THREE.Vector3 | null {
		const def = this.item ? ITEMS[this.item] : undefined;
		const at = def?.firearm && def.hold.muzzle;
		if (!at || !this.model || !this.grip.visible || !this.root.visible) return null;
		this.model.updateWorldMatrix(true, false);
		return this.model.localToWorld(target.set(...at));
	}

	/** The held item in the hand: swapped when it changes, put away while the hands are busy. */
	private hold(state: PlayerState): void {
		const stack = held(state.inventory);
		const id = stack && ITEMS[stack.item]?.grip ? stack.item : null;
		if (id !== this.item) this.setItem(id);
		this.grip.visible =
			!!this.model && !state.dead && !state.downed && !state.climbing && !state.swimming;
	}

	private setItem(id: string | null): void {
		this.item = id;
		if (this.model) this.grip.remove(this.model);
		this.model = null;
		const def = id ? ITEMS[id] : undefined;
		const grip = def?.grip;
		if (!def || !grip) return;
		this.grip.position.set(...grip.offset);
		this.grip.rotation.set(...grip.rotation);
		const token = ++this.loading;
		void itemModel(def).then((model) => {
			if (token !== this.loading || this.disposed) return;
			this.model = model;
			this.grip.add(model);
		});
	}

	/** The full-body clip: stance, speed, a swing, a fall, a climb. */
	private full(delta: number, state: PlayerState, animator: Animator): void {
		const speed = Math.hypot(state.velocity[0], state.velocity[2]);
		const w = state.weapon;
		const began = w.time < this.actionTime;
		this.actionTime = w.time;

		let anim: AnimSlot;
		let pace = 0;
		const hobble = state.conditions.find((c) => c.id === 'hobble');
		const fell = hobble && hobble.remaining > CONDITIONS.hobble.seconds - FALL_PLAY;
		if (state.dead || state.downed) {
			anim = 'die';
		} else if (state.climbing) {
			// Up the rope, down it (the climb backwards), or just hanging there. Sliding down fast
			// is the hang, hands gripping.
			const vy = state.velocity[1];
			const sliding = vy < -CLIMB.downSpeed * 1.2;
			const climbing = Math.abs(vy) > 0.02 && !sliding;
			anim = climbing ? 'rope_climb' : 'rope_idle';
			pace = climbing ? vy / CLIMB.upSpeed : 1;
		} else if (fell || (!state.grounded && -state.velocity[1] > FALL.safeSpeed)) {
			anim = 'fall';
			pace = 1;
		} else if (state.mantle) {
			anim = 'climb';
			pace = 1;
		} else if (w.action === 'swing' || w.action === 'throw') {
			anim = 'melee_attack';
			const def = ITEMS[held(state.inventory)?.item ?? ''];
			const seconds =
				w.action === 'throw'
					? def?.throwable?.duration
					: def?.melee && def.melee.windup + def.melee.recovery;
			if (seconds) animator.setDuration('melee_attack', seconds);
			animator.play(anim, w.time, began);
			animator.update(delta);
			return;
		} else if (state.swimming) {
			// No swimming clip: the crawl is the nearest thing, flat out in the water.
			anim = 'crawl';
			pace = speed / MOVEMENT.swim.speed;
		} else if (state.stance !== 'stand') {
			anim = state.stance;
			pace = speed / MOVEMENT.stances[state.stance].speed;
		} else if (speed < STILL) {
			anim = 'idle';
			pace = 1;
		} else if (speed > (MOVEMENT.stances.stand.speed + MOVEMENT.sprintSpeed) / 2) {
			anim = 'running';
			pace = speed / MOVEMENT.sprintSpeed;
		} else {
			anim = 'walking';
			pace = speed / MOVEMENT.stances.stand.speed;
		}
		animator.play(anim);
		// Crouched or prone and not moving: the cycle stops where it is. A rope climb runs at the
		// climbing pace, backwards on the way down.
		const moving = anim === 'walking' || anim === 'running';
		if (anim === 'rope_climb') {
			animator.setRate(pace);
			animator.update(delta);
			return;
		}
		animator.setRate(
			moving
				? Math.max(RATE_RANGE[0], Math.min(RATE_RANGE[1], pace))
				: Math.min(RATE_RANGE[1], pace)
		);
		animator.update(delta);
	}

	dispose(): void {
		this.disposed = true;
		this.setItem(null);
		this.animator?.dispose();
		this.root.removeFromParent();
	}
}
