import { DEFAULT_HEADLAMP, type HeadlampModel } from '../../content/items/headlamps.ts';
import type { PlayerState } from './types.ts';

/**
 * Headlamp light output, including flicker. Deterministic from the player's state (its lamp
 * clock and battery), so the server can later ask "is this lamp flickering right now?" and get
 * the same answer the client renders. See docs/dev/player.md.
 */

export interface HeadlampOutput {
	on: boolean;
	/** 0..1 multiplier applied to the mode's intensity this instant. */
	level: number;
	intensity: number;
	range: number;
	angle: number;
	/** True while a flicker dip is happening. */
	flickering: boolean;
}

/** Integer hash -> [0, 1). */
function hash(n: number): number {
	let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
	x ^= x >>> 13;
	x = Math.imul(x, 0xc2b2ae35);
	x ^= x >>> 16;
	return (x >>> 0) / 4294967296;
}

const SLOTS_PER_SECOND = 8;
const STUTTER_PER_SECOND = 40;

export function headlampOutput(
	state: PlayerState,
	model: HeadlampModel = DEFAULT_HEADLAMP
): HeadlampOutput {
	const mode = state.headlamp ? model.modes[state.headlamp] : null;
	if (!mode || state.battery <= 0) {
		return { on: false, level: 0, intensity: 0, range: 0, angle: 0, flickering: false };
	}
	const { rate, depth, lowBattery } = model.flicker;
	const weak = state.battery < lowBattery ? 1 - state.battery / lowBattery : 0;
	const slot = Math.floor(state.lampClock * SLOTS_PER_SECOND);
	const chance = (rate + weak * 2) / SLOTS_PER_SECOND;
	const flickering = hash(slot) < chance;
	let level = 1 - weak * 0.5;
	if (flickering) {
		const dip = depth * (0.5 + 0.5 * hash(slot + 7919));
		const stutter = hash(Math.floor(state.lampClock * STUTTER_PER_SECOND) + 104729) > 0.5;
		level *= 1 - (stutter ? dip : dip * 0.3);
	}
	return {
		on: true,
		level,
		intensity: mode.intensity * level,
		range: mode.range,
		angle: mode.angle,
		flickering
	};
}
