/**
 * Undercroft's audio manager: WICK's (`@wick/audio`), set up with Undercroft's volume groups and
 * its player settings. Music is dry (no muffle or reverb); sfx and ambience are world sounds.
 * Volumes come from `settings.audio`, mono and background muting from the settings too.
 * See docs/dev/player.md#audio and the University's Audio chapter.
 */
import { AudioManager as WickAudioManager } from '@wick/audio';
import {
	AUDIO_CATEGORIES,
	SOUND_CATEGORIES,
	type AudioCategory,
	type SoundCategory
} from '#lib/content/audio/categories.ts';
import { settings } from '#lib/settings/settings.svelte.ts';

export { applyAudioOptions, type SoundHandle } from '@wick/audio';
/** The volume groups live with the sound data (content/audio/categories.ts). */
export { AUDIO_CATEGORIES, type AudioCategory, type SoundCategory };

export class AudioManager extends WickAudioManager<SoundCategory> {
	constructor(volumes: Record<AudioCategory, number>) {
		super({
			categories: SOUND_CATEGORIES,
			dry: ['music'],
			defaultCategory: 'sfx',
			volumes,
			options: () => ({
				mono: settings.accessibility.monoAudio,
				muteInBackground: settings.sound.muteInBackground
			})
		});
	}
}
