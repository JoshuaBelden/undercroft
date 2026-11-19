import * as THREE from 'three';
import type { SoundId } from '#lib/content/audio/sounds.ts';
import { DEFAULT_FOOTSTEP, FOOTSTEPS } from '#lib/content/audio/surfaces.ts';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import type { SoundHandle } from '#lib/game/audio/AudioManager.ts';
import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import { ROPE_CREAK, ROPE_CREAK_GAP } from './RopeCreaks.ts';

/** Breathing is silent above this fraction of stamina, fading in over the next 5% below it. */
const BREATH_BELOW = 0.25;

/**
 * The local player's own sounds: footsteps by surface, breathing that follows stamina, and the
 * headlamp click. Footstep surface comes from the material under the player's feet.
 */

export class PlayerAudio {
	private travelled = 0;
	private last: [number, number, number] | null = null;
	private lamp: number | null = null;
	private swimming = false;
	private underwater = false;
	private mantling = false;
	/** On the floor last frame, and in the air from a jump (for the footfall on landing). */
	private grounded = false;
	private jumped = false;
	/** Metres climbed (up or down) since the rope last creaked; null while not on one. */
	private climbed: number | null = null;
	private climbY = 0;
	/** When the rope last creaked (performance.now). */
	private creakAt = 0;
	/** Pushing through a squeeze (the grunt has played; the gasp comes on the way out). */
	private inSqueeze = false;
	private breathSlow: SoundHandle | null = null;
	private breathFast: SoundHandle | null = null;
	private breathStarting = false;
	private ray = new THREE.Raycaster();
	private down = new THREE.Vector3(0, -1, 0);
	private origin = new THREE.Vector3();

	constructor(
		private sounds: SoundBank,
		private map: THREE.Object3D
	) {
		this.ray.far = 1.2;
	}

	update(state: PlayerState | null, unlocked: boolean): void {
		if (!state) return;
		if (unlocked && !this.breathStarting) {
			this.breathStarting = true;
			void this.sounds.loop('breath.slow').then((handle) => (this.breathSlow = handle));
			void this.sounds.loop('breath.fast').then((handle) => (this.breathFast = handle));
		}
		this.updateBreath(state);

		if (this.lamp !== null && state.headlamp !== this.lamp) {
			this.sounds.play(state.headlamp === 0 ? 'headlamp.off' : 'headlamp.on');
		}
		this.lamp = state.headlamp;

		if (state.swimming && !this.swimming) this.sounds.play('water.enter');
		if (state.mantle && !this.mantling) this.sounds.play('mantle');
		this.updateJump(state);
		this.updateRope(state);
		this.updateSqueeze(state);
		this.swimming = state.swimming;
		this.underwater = state.underwater;
		this.mantling = !!state.mantle;

		const [x, y, z] = state.position;
		if (this.last && !state.flags.noclip && !state.mantle) {
			if (state.swimming) {
				this.travelled += Math.hypot(x - this.last[0], y - this.last[1], z - this.last[2]);
				if (this.travelled >= MOVEMENT.swim.stride) {
					this.travelled = 0;
					this.sounds.play('swim.stroke', state.underwater ? 0.4 : 1);
				}
			} else if (state.grounded) {
				this.travelled += Math.hypot(x - this.last[0], z - this.last[2]);
				const stance = MOVEMENT.stances[state.stance];
				const sprinting = Math.hypot(state.velocity[0], state.velocity[2]) > stance.speed + 0.3;
				const stride = sprinting ? MOVEMENT.sprintStride : stance.stride;
				if (this.travelled >= stride) {
					this.travelled = 0;
					// Sneaking is silent.
					if (!state.sneaking) {
						let id: SoundId = this.surface(state);
						if (state.wading) id = 'footstep.wade';
						else if (sprinting) id = 'footstep.run';
						this.sounds.play(id, stance.footstepVolume);
					}
				}
			}
		}
		this.last = [x, y, z];
	}

	/** A jump: a scuff as the feet leave the floor and a footfall as they come down. */
	private updateJump(state: PlayerState): void {
		const leaving =
			this.grounded &&
			!state.grounded &&
			!state.mantle &&
			state.velocity[1] > MOVEMENT.jump.speed / 2;
		if (leaving) {
			this.jumped = true;
			this.sounds.play('jump');
		} else if (this.jumped && state.grounded) {
			this.jumped = false;
			this.sounds.play(this.surface(state), MOVEMENT.stances[state.stance].footstepVolume);
		}
		if (state.climbing || state.swimming || state.mantle) this.jumped = false;
		this.grounded = state.grounded;
	}

	/** Climbing a rope: a creak every so often as you go up or down it. */
	private updateRope(state: PlayerState): void {
		if (!state.climbing) {
			this.climbed = null;
			return;
		}
		const y = state.position[1];
		if (this.climbed === null) this.climbed = 0;
		else this.climbed += Math.abs(y - this.climbY);
		this.climbY = y;
		const now = performance.now();
		if (this.climbed >= ROPE_CREAK && now - this.creakAt >= ROPE_CREAK_GAP) {
			this.climbed = 0;
			this.creakAt = now;
			this.sounds.play('rope.tension');
		}
	}

	/** Pushing through a squeeze: one grunt as you start to move through it, a gasp on the way out. */
	private updateSqueeze(state: PlayerState): void {
		if (!state.squeezing) {
			// Out the other side: a breath at last.
			if (this.inSqueeze) this.sounds.play('gasp');
			this.inSqueeze = false;
			return;
		}
		// Starting to push through: one grunt.
		if (!this.inSqueeze && Math.hypot(state.velocity[0], state.velocity[2]) > 0.2) {
			this.inSqueeze = true;
			this.sounds.play('squeeze.grunt');
		}
	}

	dispose(): void {
		this.breathSlow?.stop();
		this.breathFast?.stop();
		this.breathSlow = null;
		this.breathFast = null;
	}

	/**
	 * Breathing only once stamina is down to BREATH_BELOW (a quarter): calm at first, crossfading
	 * to panting as it runs out; silent above that and underwater.
	 */
	private updateBreath(state: PlayerState): void {
		const left = state.stamina / MOVEMENT.stamina.max;
		const tired = 1 - left;
		// 0 at a quarter of stamina left, 1 when it is gone.
		const low = Math.max(0, Math.min(1, (BREATH_BELOW - left) / BREATH_BELOW));
		const fast = state.exhausted ? 1 : low * low * (3 - 2 * low);
		const winded = Math.max(0, Math.min(1, (BREATH_BELOW - left) / 0.05));
		const air = state.underwater ? 0 : winded;
		this.breathSlow?.setVolume(air * (1 - fast) * (0.25 + 0.5 * tired));
		this.breathFast?.setVolume(air * fast * (0.6 + 0.4 * tired));
		this.breathFast?.setRate(0.9 + 0.2 * tired);
	}

	private surface(state: PlayerState): SoundId {
		const [x, y, z] = state.position;
		this.origin.set(x, y + 0.5, z);
		this.ray.set(this.origin, this.down);
		const hit = this.ray.intersectObject(this.map, true)[0];
		const material = hit?.object instanceof THREE.Mesh ? hit.object.material : null;
		const name = Array.isArray(material) ? material[0]?.name : material?.name;
		return (name && FOOTSTEPS[name]) || DEFAULT_FOOTSTEP;
	}
}
