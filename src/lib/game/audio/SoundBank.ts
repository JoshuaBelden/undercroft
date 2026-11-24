/**
 * Undercroft's sound bank: WICK's (`@wick/audio`), playing the sound registry
 * (content/audio/sounds.ts) from the files `pnpm asset:audio` built. A sound with no recording
 * built plays nothing (the admin Art & Assets page lists it as missing). See docs/dev/player.md.
 */
import { SoundBank as WickSoundBank } from '@wick/audio';
import type { SoundCategory } from '#lib/content/audio/categories.ts';
import { AUDIO_FILES, AUDIO_LOOP_STARTS } from '#lib/content/audio/files.generated.ts';
import { SOUNDS, type SoundId } from '#lib/content/audio/sounds.ts';
import type { AudioManager } from './AudioManager.ts';

export class SoundBank extends WickSoundBank<SoundId, SoundCategory> {
	constructor(audio: AudioManager) {
		super(audio, { sounds: SOUNDS, files: AUDIO_FILES, loopStarts: AUDIO_LOOP_STARTS });
	}
}
