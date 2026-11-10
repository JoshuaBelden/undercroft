import type { Acoustics } from '../../shared/map/types.ts';
import type { SoundId } from './sounds.ts';

/**
 * Cave ambience tuning: how each kind of space sounds, and the background sounds of the
 * catacombs. See docs/dev/player.md (Audio).
 */

/** Reverb (0 dry .. 1 vast) and damping (0 clear .. 1 underwater) per kind of space. */
export const ACOUSTICS: Record<Acoustics, { reverb: number; muffle: number }> = {
	tight: { reverb: 0, muffle: 0.3 },
	tunnel: { reverb: 0.25, muffle: 0 },
	hall: { reverb: 0.45, muffle: 0 },
	vast: { reverb: 0.75, muffle: 0 }
};

export const AMBIENCE = {
	drip: {
		/** Seconds between drips, [min, max]. */
		interval: [2, 7] as [number, number],
		/** Near water, drips come more often. */
		nearWaterInterval: [0.8, 3] as [number, number],
		/** Metres from the listener. */
		distance: [2, 8] as [number, number],
		volume: 0.5
	},
	/** Rare far-off sounds that make the catacombs feel occupied. */
	distant: {
		interval: [25, 70] as [number, number],
		distance: [20, 35] as [number, number],
		volume: 0.7,
		sounds: ['ambience.knock', 'ambience.rockfall', 'ambience.creak'] as SoundId[]
	},
	/** Rare unsettling swells that play around the listener, not from a point. */
	creepy: {
		interval: [60, 150] as [number, number],
		volume: 0.6
	},
	/** Soft lapping loop that fades in near water. */
	lap: { radius: 6, volume: 0.5 }
};
