/**
 * The audio manager's volume groups (docs/dev/player.md#audio). Here, not in AudioManager.ts, so
 * the sound data can name them without the browser-only audio code (the admin app reads it).
 */
export const AUDIO_CATEGORIES = ['master', 'music', 'ambience', 'sfx'] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];
