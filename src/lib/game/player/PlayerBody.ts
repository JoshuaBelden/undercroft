import * as THREE from 'three';
import type { AnimSlot } from '#lib/content/animations.ts';
import { ITEMS } from '#lib/content/items.ts';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import { PLAYER_MODEL } from '#lib/content/player/model.ts';
import { Animator } from '#lib/game/Animator.ts';
import { loadCharacter } from '#lib/game/assets.ts';
import { held } from '#lib/shared/items/inventory.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

/** Below this speed (m/s) a standing player is idle. */
const STILL = 0.2;
/** How far a walk or run cycle may be slowed or hurried to match the ground speed. */
const RATE_RANGE: [number, number] = [0.4, 1.6];

/**
 * A player's body: the explorer model, animated from that player's state alone (stance, speed,
 * what the hand is doing), so it needs nothing extra from the server. Used for other players and
 * for yourself in the over-the-shoulder view. The owner places `root` at the feet.
 * See docs/dev/player.md (Player model).
 */
export class PlayerBody {
	readonly root = new THREE.Group();
	private animator: Animator | null = null;
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
		});
	}

	/** Face `yaw` and animate for this state. */
	update(delta: number, state: PlayerState, yaw: number): void {
		this.root.rotation.y = yaw;
		const animator = this.animator;
		if (!animator) return;
		const speed = Math.hypot(state.velocity[0], state.velocity[2]);
		const w = state.weapon;
		const began = w.time < this.actionTime;
		this.actionTime = w.time;

		let anim: AnimSlot;
		let pace = 0;
		if (state.dead || state.downed) {
			anim = 'die';
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
		// Crouched or prone and not moving: the cycle stops where it is.
		const moving = anim === 'walking' || anim === 'running';
		animator.setRate(
			moving
				? Math.max(RATE_RANGE[0], Math.min(RATE_RANGE[1], pace))
				: Math.min(RATE_RANGE[1], pace)
		);
		animator.update(delta);
	}

	dispose(): void {
		this.disposed = true;
		this.animator?.dispose();
		this.root.removeFromParent();
	}
}
