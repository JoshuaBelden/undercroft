import * as THREE from 'three';
import type { AnimSlot } from '#lib/content/animations.ts';
import { HANDS, heldDef, ITEMS } from '#lib/content/items.ts';
import { CONDITIONS } from '#lib/content/player/conditions.ts';
import { CLIMB, FALL, MOVEMENT } from '#lib/content/player/movement.ts';
import { PLAYER_MODEL } from '#lib/content/player/model.ts';
import { Animator } from '#lib/game/Animator.ts';
import { SteadyLight } from '#lib/game/flashing.ts';
import { itemModel } from '#lib/game/items/itemModel.ts';
import { UpperBody } from '#lib/game/UpperBody.ts';
import { held } from '#lib/shared/items/inventory.ts';
import { THROW_DRAW, THROW_FOLLOW } from '#lib/shared/items/weapons.ts';
import { headlampOutput } from '#lib/shared/player/headlamp.ts';
import { kneeling } from '#lib/shared/player/simulate.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import { DEFAULT_LOOK, sameLook, type Look } from '#lib/shared/player/look.ts';
import { dress, type Dressed } from './dress.ts';
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
 * Your own body over the shoulder is lit from the camera too, this strong at full lamp: the
 * headlamp points ahead, so without it the back you look at is black. Some of it whatever way a
 * face turns (AMBIENT), the rest on what faces the camera.
 */
const OWN_FILL = 0.45;
const OWN_FILL_AMBIENT = 0.35;
/**
 * Looking about standing still, the body stays put and the head turns, up to `yaw` (rad) aside
 * and `pitch` up or down; look further aside and the body comes round to face it. Lying on the
 * floor crawling, the head turns less, so the body comes round sooner. The neck takes NECK_SHARE of the turn, the head the rest.
 */
const HEAD_TURN = { yaw: 1.1, pitch: 0.6 };
const CRAWL_HEAD_TURN = { yaw: 0.8, pitch: 0.4 };
const NECK_SHARE = 0.4;
/** How fast the body turns to face the look (1/s, eased): walking, and when doing something. */
const TURN_RATE = 8;
const ACT_TURN_RATE = 20;
/** Coming round on the spot, it turns until the head is this close to straight (rad). */
const SETTLED = 0.05;

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
	/** Your own body's fill from the camera (`own`), following your lamp, and its materials. */
	private fill = { value: 0 };
	private steady = new SteadyLight();
	/** The look worn, what it is drawn with, and the dressing in progress (newest wins). */
	private wearing: Look | null = null;
	private dressed: Dressed | null = null;
	private dressing = 0;
	/** Which way the body faces (null until the first frame): the look, once it moves. */
	private facing: number | null = null;
	/** Coming round on the spot after looking too far aside (HEAD_TURN). */
	private turning = false;
	private headBone: THREE.Object3D | null = null;
	private neckBone: THREE.Object3D | null = null;
	private turn = new THREE.Quaternion();
	private tilt = new THREE.Quaternion();
	private parentTurn = new THREE.Quaternion();
	private toParent = new THREE.Quaternion();
	private right = new THREE.Vector3();
	/**
	 * Per turned bone, its pose from the clips (`base`) and the pose the turn left it in
	 * (`left`). A clip that is held still (the idle's frozen frame) doesn't write the bone again,
	 * so a bone still as it was left is put back to its base before turning it again: the turn
	 * never piles up frame on frame.
	 */
	private turned = new Map<THREE.Object3D, { base: THREE.Quaternion; left: THREE.Quaternion }>();
	/** The hand action and its clock last frame: a new action, or the clock going back, starts it. */
	private action = 'none';
	private actionTime = 0;

	/**
	 * `own`: your own body, seen over the shoulder, lit from the camera (OWN_FILL). `look`: how
	 * the player dressed their explorer (`setLook` changes it later).
	 */
	constructor(
		private own = false,
		look: Look = DEFAULT_LOOK
	) {
		this.root.name = 'player-body';
		this.root.rotation.order = 'YXZ';
		this.setLook(look);
		this.grip.name = 'held-item';
		this.floor.name = 'set-down-item';
		this.floor.position.set(...FLOOR_SPOT);
		this.floor.visible = false;
		this.root.add(this.floor);
		this.grip.visible = false;
	}

	/**
	 * Dress the body in a look: the old one is taken off once the new one has loaded, and the clips
	 * start over on it. The same look again does nothing.
	 */
	setLook(look: Look): void {
		if (this.wearing && sameLook(this.wearing, look)) return;
		this.wearing = look;
		const token = ++this.dressing;
		const fill = this.own ? { fill: this.fill, fillAmbient: OWN_FILL_AMBIENT } : {};
		void dress(look, fill).then((dressed) => {
			if (this.disposed || token !== this.dressing) {
				for (const m of dressed.materials) m.dispose();
				return;
			}
			this.undress();
			const { scene, clips } = dressed;
			scene.rotation.y = PLAYER_MODEL.yawOffset;
			this.root.add(scene);
			this.dressed = dressed;
			this.animator = new Animator(scene, clips, PLAYER_MODEL.animations);
			this.upper = new UpperBody(scene, clips, PLAYER_MODEL.upper);
			scene.getObjectByName(PLAYER_MODEL.hand)?.add(this.grip);
			this.headBone = scene.getObjectByName(PLAYER_MODEL.head) ?? null;
			this.neckBone = scene.getObjectByName(PLAYER_MODEL.neck) ?? null;
			this.turned.clear();
		});
	}

	/** Take the current look off (its scene, clips and materials). */
	private undress(): void {
		const dressed = this.dressed;
		if (!dressed) return;
		this.animator?.dispose();
		this.animator = null;
		this.upper = null;
		this.grip.removeFromParent();
		dressed.scene.removeFromParent();
		for (const m of dressed.materials) m.dispose();
		this.dressed = null;
	}

	/**
	 * Look along `yaw` and `pitch` and animate for this state. The body turns to the look only as
	 * it moves (or does something); standing still, the head turns instead (`face`, `look`).
	 */
	update(delta: number, state: PlayerState, yaw: number, pitch = state.pitch): void {
		const free = this.face(delta, state, yaw);
		this.root.rotation.y = this.facing ?? yaw;
		if (this.own) {
			const out = headlampOutput(state);
			this.fill.value = OWN_FILL * this.steady.follow(out.on ? out.level : 0);
		}
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
		this.unturn();
		if (free) this.look(yaw, pitch, state.stance === 'crawl' ? CRAWL_HEAD_TURN : HEAD_TURN);
		this.hold(state);
	}

	/**
	 * Turn the body for this frame: toward the look while moving or doing something (and always
	 * where the whole body goes with the look: climbing, swimming, down); standing still, only
	 * once the look is more than HEAD_TURN (CRAWL_HEAD_TURN) aside, and then all the way round.
	 * Returns whether the head is free to turn on its own.
	 */
	private face(delta: number, state: PlayerState, yaw: number): boolean {
		const whole = state.climbing || state.swimming || state.downed || state.dead || !!state.mantle;
		if (this.facing === null || whole) {
			this.facing = yaw;
			this.turning = false;
			return false;
		}
		const w = state.weapon;
		const acting = w.aiming || (w.action !== 'none' && w.action !== 'equip');
		const moving = Math.hypot(state.velocity[0], state.velocity[2]) > STILL;
		const off = angleTo(this.facing, yaw);
		const crawling = state.stance === 'crawl';
		if (Math.abs(off) > (crawling ? CRAWL_HEAD_TURN : HEAD_TURN).yaw) this.turning = true;
		if (moving || acting || this.turning) {
			const rate = acting ? ACT_TURN_RATE : TURN_RATE;
			this.facing += off * Math.min(1, delta * rate);
			if (Math.abs(angleTo(this.facing, yaw)) < SETTLED) this.turning = false;
		}
		return true;
	}

	/** Put the turned bones back as the clips posed them, where the clips didn't (`turned`). */
	private unturn(): void {
		for (const [bone, pose] of this.turned) {
			if (bone.quaternion.equals(pose.left)) bone.quaternion.copy(pose.base);
		}
	}

	/**
	 * Turn the neck and head (over whatever the clips posed) to look along `yaw` and `pitch`,
	 * as far as a head turns (`limit`): the body's facing does the rest.
	 */
	private look(yaw: number, pitch: number, limit: { yaw: number; pitch: number }): void {
		const head = this.headBone;
		if (!head || this.facing === null) return;
		const aside = THREE.MathUtils.clamp(angleTo(this.facing, yaw), -limit.yaw, limit.yaw);
		const up = THREE.MathUtils.clamp(pitch, -limit.pitch, limit.pitch);
		const lookYaw = this.facing + aside;
		const right = this.right.set(Math.cos(lookYaw), 0, -Math.sin(lookYaw));
		const bones: [THREE.Object3D, number][] = this.neckBone
			? [
					[this.neckBone, NECK_SHARE],
					[head, 1 - NECK_SHARE]
				]
			: [[head, 1]];
		this.root.updateMatrixWorld(true);
		for (const [bone, share] of bones) {
			// Turned in the world (round the up axis, then up or down about the look's right),
			// brought into the bone's parent's frame.
			this.turn.setFromAxisAngle(UP, aside * share);
			this.tilt.setFromAxisAngle(right, up * share);
			this.turn.premultiply(this.tilt);
			bone.parent?.getWorldQuaternion(this.parentTurn);
			this.toParent.copy(this.parentTurn).invert().multiply(this.turn).multiply(this.parentTurn);
			let pose = this.turned.get(bone);
			if (!pose) {
				pose = { base: new THREE.Quaternion(), left: new THREE.Quaternion() };
				this.turned.set(bone, pose);
			}
			pose.base.copy(bone.quaternion);
			bone.quaternion.premultiply(this.toParent);
			pose.left.copy(bone.quaternion);
			bone.updateMatrixWorld(true);
		}
	}

	/**
	 * Where the held gun's muzzle is in the world (its `muzzle`), for the flare and smoke of
	 * a shot; null when no gun is drawn in the hand.
	 */
	muzzle(target: THREE.Vector3): THREE.Vector3 | null {
		const def = this.item ? ITEMS[this.item] : undefined;
		const at = def?.firearm && def.muzzle;
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
		} else if (!state.grounded && !state.swimming && state.velocity[1] > 0.5) {
			// On the way up from a jump (no clip yet: falls back to the run).
			anim = 'jumping';
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
			const melee = heldDef(held(state.inventory)?.item ?? HANDS.id)?.melee;
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
		this.undress();
		this.root.removeFromParent();
	}
}

const UP = new THREE.Vector3(0, 1, 0);

/** The turn (rad) from `from` to `to`, the short way round. */
function angleTo(from: number, to: number): number {
	const d = to - from;
	return Math.atan2(Math.sin(d), Math.cos(d));
}
