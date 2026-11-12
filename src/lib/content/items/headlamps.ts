/**
 * Headlamp models. The starter lamp is inefficient and flickers a lot (which reveals
 * creatures in half-light). Charge is measured in volts: 24 V full, 0 V dead. Upgrades are added here. See docs/dev/player.md.
 */

export interface HeadlampModeSpec {
	/** Spotlight intensity (candela-ish, Three.js physical units). */
	intensity: number;
	/** Light range in metres. */
	range: number;
	/** Cone half-angle in radians. */
	angle: number;
	/** Battery fraction drained per second. */
	drain: number;
}

export interface HeadlampModel {
	id: string;
	name: string;
	/** Index 1 = low, 2 = bright (0 is off). */
	modes: [null, HeadlampModeSpec, HeadlampModeSpec];
	flicker: {
		/** Average flicker events per second. */
		rate: number;
		/** How far intensity dips during a flicker, 0..1. */
		depth: number;
		/** Below this battery fraction, flicker gets steadily worse. */
		lowBattery: number;
	};
	color: number;
	/**
	 * Its voltage when the battery is full (0 is dead). `PlayerState.battery` is the fraction of
	 * it left; the HUD shows it in volts, and a battery item adds its `charge.volts`.
	 */
	volts: number;
	/** Below `volts` (and above 0), with the lamp on, it beeps (`battery.low`) every `seconds`. */
	lowAlert: { volts: number; seconds: number };
}

export const HEADLAMPS: Record<string, HeadlampModel> = {
	starter: {
		id: 'starter',
		name: 'Starter headlamp',
		modes: [
			null,
			{ intensity: 11, range: 9, angle: 0.85, drain: 1 / 900 },
			{ intensity: 55, range: 20, angle: 0.42, drain: 1 / 300 }
		],
		flicker: { rate: 0.35, depth: 0.85, lowBattery: 0.2 },
		color: 0xffe2b0,
		volts: 24,
		lowAlert: { volts: 3, seconds: 60 }
	}
};

export const DEFAULT_HEADLAMP = HEADLAMPS.starter;
