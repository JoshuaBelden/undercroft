/**
 * The audio manager's volume groups (docs/dev/player.md#audio). Here, not in AudioManager.ts, so
 * the sound data can name them without the browser-only audio code (the admin app reads it).
 * `master` is WICK's master bus; the rest are Undercroft's category buses.
 */
export const AUDIO_CATEGORIES = ['master', 'music', 'ambience', 'sfx'] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

/** The categories a sound plays on (every group but master). */
export type SoundCategory = Exclude<AudioCategory, 'master'>;
export const SOUND_CATEGORIES = AUDIO_CATEGORIES.filter(
	(category): category is SoundCategory => category !== 'master'
);
