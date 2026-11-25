import { DEFAULT_HEADLAMP } from '#lib/content/items/headlamps.ts';
import { ITEMS } from '#lib/content/items.ts';
import { CRAFT } from '#lib/content/recipes.ts';
import { SANITY } from '#lib/content/player/sanity.ts';
import type { SoundHandle } from '#lib/game/audio/AudioManager.ts';
import { rumble } from '#lib/game/input/gamepad.ts';
import { quickWith, shieldOf } from '#lib/shared/items/inventory.ts';
import { charging, healing } from '#lib/shared/player/simulate.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { PlayContext, PlayFeature, Prompt } from './feature.ts';
import { keyPrompt } from './prompt.ts';

/**
 * Sanity, the lamp and wounds (docs/dev/player.md): the heartbeat, the hurt flash and shake,
 * whispers, the battery and bandage sounds, and the prompts for bandaging, changing the battery
 * and reviving a teammate.
 */
export class Vitals implements PlayFeature {
	/** How hard the view shakes, 0..1 (the page's camera reads it). */
	shake = 0;
	/** Blows taken so far: the HUD flashes each time it goes up. */
	hurts = 0;
	private heartbeat: SoundHandle | null = null;
	private heartbeatStarting = false;
	private lastSanity: number | null = null;
	/** Shield points left on what is worn, last frame (a drop is a blow it took). */
	private lastShield: number | null = null;
	/** Headlamp charge last frame (a jump up is a battery going in). */
	private lastBattery: number | null = null;
	/** Seconds to the next low-battery beep while the lamp is low; null while it isn't. */
	private lowBatteryIn: number | null = null;
	/** Bandaging last frame (starting plays the sound), and when it last played (ms). */
	private wasBandaging = false;
	private bandageSoundAt = 0;
	private whisperIn = 8;

	constructor(private ctx: PlayContext) {}

	self(state: PlayerState, delta: number): void {
		this.sanityEffects(state, delta);
		this.lampSounds(state, delta);
	}

	/** Heartbeat, hurt flash and shake, and whispers, from the current sanity. */
	private sanityEffects(state: PlayerState, delta: number): void {
		const { sounds, audio } = this.ctx;
		const sanity = state.sanity / SANITY.max;
		if (this.lastSanity !== null && state.sanity < this.lastSanity - 3) {
			this.shake = Math.min(1, this.shake + (this.lastSanity - state.sanity) / 30);
			this.hurts++;
			sounds.play('player.hurt');
			rumble('hit');
		}
		this.lastSanity = state.sanity;
		const shield = shieldOf(state.inventory)?.left ?? null;
		if (this.lastShield !== null && shield !== null && shield < this.lastShield - 1) {
			this.shake = Math.min(1, this.shake + (this.lastShield - shield) / 60);
			sounds.play('player.shielded');
		}
		this.lastShield = shield;
		this.shake = Math.max(0, this.shake - delta * 2.5);
		if (audio.unlocked && !this.heartbeat && !this.heartbeatStarting) {
			this.heartbeatStarting = true;
			void sounds.loop('heartbeat').then((handle) => (this.heartbeat = handle));
		}
		const fear = state.downed ? 1 : Math.max(0, (0.4 - sanity) / 0.4);
		this.heartbeat?.setVolume(fear);
		this.heartbeat?.setRate(1 + fear * 0.45);
		if (sanity < 0.2 && !state.downed) {
			this.whisperIn -= delta;
			if (this.whisperIn <= 0) {
				this.whisperIn = 6 + Math.random() * 8;
				const angle = Math.random() * Math.PI * 2;
				const [x, y, z] = state.position;
				sounds.playAt('whisper', [x + Math.sin(angle) * 1.5, y + 1.5, z + Math.cos(angle) * 1.5]);
			}
		}
	}

	/**
	 * The headlamp and bandages: a battery going in, the low-battery beep (on crossing under
	 * `lowAlert.volts`, then every `lowAlert.seconds` while the lamp is on), and binding a wound.
	 */
	private lampSounds(state: PlayerState, delta: number): void {
		const { sounds } = this.ctx;
		if (this.lastBattery !== null && state.battery > this.lastBattery + 0.05) {
			sounds.play('battery.charged');
		}
		this.lastBattery = state.battery;
		const { lowAlert, volts } = DEFAULT_HEADLAMP;
		const charge = state.battery * volts;
		if (state.headlamp > 0 && charge > 0 && charge < lowAlert.volts && !state.downed) {
			this.lowBatteryIn = (this.lowBatteryIn ?? 0) - delta;
			if (this.lowBatteryIn <= 0) {
				sounds.play('battery.low');
				this.lowBatteryIn = lowAlert.seconds;
			}
		} else if (charge >= lowAlert.volts || charge <= 0) {
			// Switching the lamp off and on again doesn't restart the minute; charging it does.
			this.lowBatteryIn = null;
		}
		const bandaging = state.bandaging > 0;
		// One play at a time: the clip runs most of a bandage, and isn't cut short.
		if (bandaging && !this.wasBandaging && performance.now() - this.bandageSoundAt > 2500) {
			sounds.play('bandage');
			this.bandageSoundAt = performance.now();
		}
		this.wasBandaging = bandaging;
	}

	/** Bandaging, changing the battery, or a downed teammate in reach to revive. */
	prompt(state: PlayerState): Prompt | null {
		const heal = healing(state);
		if (heal && state.bandaging > 0) {
			return {
				prompt: 'Bandaging...',
				progress: state.bandaging / (heal.seconds * state.mods.healTime)
			};
		}
		const charge = charging(state);
		if (charge && state.charging > 0) {
			return { prompt: 'Changing the battery...', progress: state.charging / charge.seconds };
		}
		if (state.crafting > 0) {
			const name = ITEMS[state.craftingItem ?? '']?.name ?? 'something';
			return {
				prompt: `Working on ${name.toLowerCase()}...`,
				progress: state.crafting / (CRAFT.field.seconds * state.mods.craftTime)
			};
		}
		if (this.downedNearby(state)) {
			// By hand always; smelling salts to hand bring them round stronger (and are used).
			const salts = quickWith(state.inventory, 'revive') >= 0;
			return keyPrompt(
				'interact',
				salts ? 'Revive explorer with smelling salts' : 'Revive explorer',
				state.reviving / SANITY.reviveSeconds
			);
		}
		return null;
	}

	/** A downed teammate within reach, if any. */
	private downedNearby(state: PlayerState): PlayerState | null {
		for (const other of this.ctx.remote.states()) {
			if (!other.downed || other.dead) continue;
			const d = Math.hypot(
				other.position[0] - state.position[0],
				other.position[1] - state.position[1],
				other.position[2] - state.position[2]
			);
			if (d <= SANITY.reviveRange) return other;
		}
		return null;
	}

	/** What the downed screen says will happen next. */
	downedMessage(state: PlayerState): string {
		const helpers = [...this.ctx.remote.states()].some((other) => !other.downed && !other.dead);
		if (helpers) return 'Waiting for help...';
		if (quickWith(state.inventory, 'revive') >= 0) return 'Reaching for your smelling salts...';
		return 'No one is coming';
	}

	/** Their own state is gone: the heartbeat stops and nothing is remembered of it. */
	left(): void {
		this.heartbeat?.setVolume(0);
		this.lastSanity = null;
		this.lastShield = null;
		this.lastBattery = null;
		this.lowBatteryIn = null;
		this.wasBandaging = false;
	}

	dispose(): void {
		this.heartbeat?.stop();
	}
}
