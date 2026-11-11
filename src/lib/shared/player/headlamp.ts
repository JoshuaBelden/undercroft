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
/** Above this gloom, a lamp starts cutting out completely for moments at a time. */
const GLOOM_CUTOUT = 0.7;

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
	// Gloom (the Affliction pressing in): flickers more, burns lower, and cuts out entirely.
	const gloom = Math.max(0, Math.min(1, state.gloom));
	const slot = Math.floor(state.lampClock * SLOTS_PER_SECOND);
	if (gloom > GLOOM_CUTOUT && hash(slot + 524287) < (gloom - GLOOM_CUTOUT) / (1 - GLOOM_CUTOUT)) {
		return {
			on: true,
			level: 0,
			intensity: 0,
			range: mode.range,
			angle: mode.angle,
			flickering: true
		};
	}
	const chance = (rate + weak * 2 + gloom * 4) / SLOTS_PER_SECOND;
	const flickering = hash(slot) < chance;
	let level = (1 - weak * 0.5) * (1 - 0.6 * gloom);
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
