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
	/** performance.now() of the next squeeze grunt; null when not squeezing through. */
	private nextGrunt: number | null = null;
	private exhausted = false;
	private gaspPending = false;
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
		// Gasp the moment stamina runs out (held until surfacing if it ran out underwater).
		if (state.exhausted && !this.exhausted) this.gaspPending = true;
		if (this.gaspPending && !state.underwater) {
			this.sounds.play('gasp');
			this.gaspPending = false;
		}
		this.exhausted = state.exhausted;
		if (state.mantle && !this.mantling) this.sounds.play('mantle');
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

	/** Grunt while pushing through a squeeze: once on starting to move, then every 1.3-2.2 s. */
	private updateSqueeze(state: PlayerState): void {
		const pushing = state.squeezing && Math.hypot(state.velocity[0], state.velocity[2]) > 0.2;
		if (!pushing) {
			this.nextGrunt = null;
			return;
		}
		const now = performance.now();
		if (this.nextGrunt === null || now >= this.nextGrunt) {
			this.sounds.play('squeeze.grunt');
			this.nextGrunt = now + 1300 + Math.random() * 900;
		}
	}

	dispose(): void {
		this.breathSlow?.stop();
		this.breathFast?.stop();
		this.breathSlow = null;
		this.breathFast = null;
	}

	/**
	 * Breathing only while stamina is below full: calm at first, crossfading to panting as it runs
	 * down; silent at full stamina and underwater.
	 */
	private updateBreath(state: PlayerState): void {
		const tired = 1 - state.stamina / MOVEMENT.stamina.max;
		const t = Math.max(0, Math.min(1, (tired - 0.3) / 0.45));
		const fast = state.exhausted ? 1 : t * t * (3 - 2 * t);
		// Fades in over the first 10% of stamina used, so full stamina is silent.
		const winded = Math.min(1, tired / 0.1);
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
