import type { SoundId } from './sounds.ts';

/**
 * Footstep surface per Blender material name (materials are named by use, see
 * docs/dev/asset-pipeline.md). Unlisted materials use DEFAULT_FOOTSTEP.
 */
export const FOOTSTEPS: Record<string, SoundId> = {
	'mat-floor-start': 'footstep.tile',
	'mat-floor-tunnel': 'footstep.stone',
	'mat-floor-ossuary': 'footstep.stone',
	'mat-floor-cistern': 'footstep.stone',
	'mat-floor-quarry': 'footstep.rock',
	'mat-floor-chapel': 'footstep.marble',
	'mat-trim-marble': 'footstep.marble',
	'mat-wall-tunnel': 'footstep.rock',
	'mat-basin': 'footstep.rock'
};

export const DEFAULT_FOOTSTEP: SoundId = 'footstep.stone';
