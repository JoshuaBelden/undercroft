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
import { THROW_DRAW, THROW_FOLLOW } from '#lib/shared/items/weapons.ts';
import { kneeling } from '#lib/shared/player/simulate.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import { upperBodyPose } from './pose.ts';

/** Below this speed (m/s) a standing player is idle. */
const STILL = 0.2;
/** Seconds after a fall that hurt that the fall clip plays on (about its length). */
const FALL_PLAY = 1.2;
/**
 * Sanity lost in one frame that counts as a blow (a creature's hit, a hard fall), not the slow
 * drain of the dark: the same test the HUD's hurt flash uses. The body flinches.
 */
const HIT_DROP = 3;
/** Seconds the flinch (`take_damage`) plays: the length of the explorer's cut of it. */
const FLINCH = 0.4;
/**
 * Where something worked on kneeling (a medkit) is set down, from the feet in the body's frame
 * (+X its right, -Z ahead): in front of the kneeling right knee, clear of the left shin.
 */
const FLOOR_SPOT: [number, number, number] = [0.1, 0, -0.5];
/** How far a walk or run cycle may be slowed or hurried to match the ground speed. */
const RATE_RANGE: [number, number] = [0.4, 1.6];
/** How much of the attack clip is the arm going back (by eye): a throw holds there while drawn. */
const WINDUP_PART = 0.4;

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
	/** On the floor in front of them: where something worked on kneeling (a medkit) is set down. */
	private floor = new THREE.Group();
	/** How far the held model's origin sits above its lowest point, to stand it on the floor. */
	private lift = 0;
	private item: string | null = null;
	private model: THREE.Object3D | null = null;
	private loading = 0;
	/** Shots fired, as of last frame: when it changes, another shot has begun. */
	private shots = -1;
	/** Sanity last frame: a drop of more than HIT_DROP in one go is a blow, and they flinch. */
	private sanity: number | null = null;
	/** Seconds of flinch left, and whether it began this frame. */
	private flinch = 0;
	private flinchBegan = false;
	private disposed = false;
	/** The hand action and its clock last frame: a new action, or the clock going back, starts it. */
	private action = 'none';
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
		this.floor.name = 'set-down-item';
		this.floor.position.set(...FLOOR_SPOT);
		this.floor.visible = false;
		this.root.add(this.floor);
		this.grip.visible = false;
	}

	/** Face `yaw` and animate for this state. */
	update(delta: number, state: PlayerState, yaw: number): void {
		this.root.rotation.y = yaw;
		const animator = this.animator;
		if (!animator) return;
		this.flinchBegan = this.sanity !== null && state.sanity < this.sanity - HIT_DROP;
		this.sanity = state.sanity;
		this.flinch = this.flinchBegan ? FLINCH : Math.max(0, this.flinch - delta);
		this.full(delta, state, animator);
		const shot = state.weapon.action === 'shot' && state.weapon.shots !== this.shots;
		this.shots = state.weapon.shots;
		// A flinch takes the whole body, arms and all.
		this.upper?.play(this.flinch > 0 ? null : upperBodyPose(state), shot);
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
		// Something worked on kneeling (a medkit) is set on the floor in front of them meanwhile.
		const model = this.model;
		if (!model) return;
		const down = kneeling(state);
		if (down && model.parent !== this.floor) {
			this.floor.add(model);
			model.position.set(0, this.lift, 0);
			// Its long side toward them.
			model.rotation.set(0, Math.PI / 2, 0);
		} else if (!down && model.parent !== this.grip) {
			this.grip.add(model);
			model.position.set(0, 0, 0);
			model.rotation.set(0, 0, 0);
		}
		this.floor.visible = down && this.grip.visible;
	}

	private setItem(id: string | null): void {
		this.item = id;
		this.model?.removeFromParent();
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
			model.updateMatrixWorld(true);
			this.lift = -new THREE.Box3().setFromObject(model).min.y;
			this.grip.add(model);
		});
	}

	/** The full-body clip: stance, speed, a swing, a fall, a climb. */
	private full(delta: number, state: PlayerState, animator: Animator): void {
		const speed = Math.hypot(state.velocity[0], state.velocity[2]);
		const w = state.weapon;
		const began = w.action !== this.action || w.time < this.actionTime;
		this.action = w.action;
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
		} else if (kneeling(state)) {
			// Down on one knee at a medkit set on the floor.
			anim = 'kneel';
			pace = 1;
		} else if (this.flinch > 0 && !state.swimming) {
			// Struck: the flinch plays once, over whatever they were doing (a swing included).
			animator.play('take_damage', FLINCH - this.flinch, this.flinchBegan);
			animator.update(delta);
			return;
		} else if (w.action === 'swing') {
			anim = 'melee_attack';
			const melee = ITEMS[held(state.inventory)?.item ?? '']?.melee;
			if (melee) animator.setDuration(anim, melee.windup + melee.recovery);
			animator.play(anim, w.time, began);
			animator.update(delta);
			return;
		} else if (w.action === 'draw') {
			// The attack's wind-up, drawn out over the draw and held there until they let go.
			anim = 'melee_attack';
			animator.setDuration(anim, THROW_DRAW / WINDUP_PART);
			animator.play(anim, Math.min(w.time, THROW_DRAW), began);
			animator.update(w.time < THROW_DRAW ? delta : 0);
			return;
		} else if (w.action === 'throw') {
			// The rest of the attack, as the arm comes through.
			anim = 'melee_attack';
			const seconds = THROW_FOLLOW / (1 - WINDUP_PART);
			animator.setDuration(anim, seconds);
			animator.play(anim, seconds * WINDUP_PART + w.time, began);
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
