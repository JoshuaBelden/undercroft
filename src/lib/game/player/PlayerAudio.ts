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
	private last: [number, number] | null = null;
	private lamp: number | null = null;
	private breath: SoundHandle | null = null;
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
		if (unlocked && !this.breath && !this.breathStarting) {
			this.breathStarting = true;
			void this.sounds.loop('breath').then((handle) => (this.breath = handle));
		}
		this.updateBreath(state);

		if (this.lamp !== null && state.headlamp !== this.lamp) this.sounds.play('headlamp.click');
		this.lamp = state.headlamp;

		const [x, , z] = state.position;
		if (this.last && state.grounded && !state.flags.noclip) {
			this.travelled += Math.hypot(x - this.last[0], z - this.last[1]);
			const stance = MOVEMENT.stances[state.stance];
			const sprinting = Math.hypot(state.velocity[0], state.velocity[2]) > stance.speed + 0.3;
			const stride = sprinting ? MOVEMENT.sprintStride : stance.stride;
			if (this.travelled >= stride) {
				this.travelled = 0;
				this.sounds.play(this.surface(state), stance.footstepVolume * (sprinting ? 1.2 : 1));
			}
		}
		this.last = [x, z];
	}

	dispose(): void {
		this.breath?.stop();
		this.breath = null;
	}

	private updateBreath(state: PlayerState): void {
		if (!this.breath) return;
		const tired = 1 - state.stamina / MOVEMENT.stamina.max;
		const volume = Math.min(1, Math.pow(tired, 1.5) + (state.exhausted ? 0.3 : 0));
		this.breath.setVolume(volume);
		this.breath.setRate(1 + tired * 0.6);
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
