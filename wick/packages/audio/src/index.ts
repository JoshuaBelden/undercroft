/**
 * @wick/audio: the audio manager (category buses, world muffling and reverb, positional sound),
 * the sound bank (a registry of recordings by id, with captions) and fading loops.
 * See the University's Audio chapter (wick/university).
 */
export {
	AudioManager,
	applyAudioOptions,
	MASTER,
	type AudioConfig,
	type Master,
	type OutputOptions,
	type PlayOptions,
	type PositionalOptions,
	type SoundHandle,
	type Vec3
} from './AudioManager.ts';
export { SoundBank, type SoundCatalog, type SoundDef } from './SoundBank.ts';
export { FadingLoop, type Fades, type LoopSource } from './FadingLoop.ts';
export { captionDirection, type CaptionCue, type CaptionDirection } from './captions.ts';
