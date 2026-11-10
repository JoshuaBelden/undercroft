import * as THREE from 'three';
import type { SoundId } from '#lib/content/audio/sounds.ts';
import { DEFAULT_FOOTSTEP, FOOTSTEPS } from '#lib/content/audio/surfaces.ts';
import { MOVEMENT } from '#lib/content/player/movement.ts';
import type { SoundHandle } from '#lib/game/audio/AudioManager.ts';
import type { SoundBank } from '#lib/game/audio/SoundBank.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';

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
	private breathSlow: SoundHandle | null = null;
	private breathFast: SoundHandle | null = null;
	private breathStarting = false;
	private ray = new THREE.Raycaster();
	private down = new THREE.Vector3(0, -1, 0);
	private origin = new THREE.Vector3();

	constructor(
		private sounds: SoundBank,
		private map: THREE.Object3D,
		/** Muffle world sounds (0..1), e.g. AudioManager.setMuffle. */
		private muffle: (amount: number) => void
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
		if (this.underwater && !state.underwater) {
			if (state.stamina / MOVEMENT.stamina.max < 0.3) this.sounds.play('gasp');
		}
		if (state.underwater !== this.underwater) this.muffle(state.underwater ? 1 : 0);
		if (state.mantle && !this.mantling) this.sounds.play('mantle');
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

	dispose(): void {
		this.breathSlow?.stop();
		this.breathFast?.stop();
		this.breathSlow = null;
		this.breathFast = null;
	}

	/** Calm breathing at rest, crossfading to panting as stamina runs down; silent underwater. */
	private updateBreath(state: PlayerState): void {
		const tired = 1 - state.stamina / MOVEMENT.stamina.max;
		const t = Math.max(0, Math.min(1, (tired - 0.3) / 0.45));
		const fast = state.exhausted ? 1 : t * t * (3 - 2 * t);
		const air = state.underwater ? 0 : 1;
		this.breathSlow?.setVolume(air * (1 - fast) * (0.2 + 0.5 * tired));
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
