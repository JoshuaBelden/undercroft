import { defaultBindings, type Action, type Bindings } from '#lib/game/input/actions.ts';
import type { AudioCategory } from '#lib/game/audio/AudioManager.ts';

/**
 * All player settings live here and persist to localStorage.
 * Add new settings to `Settings` and `defaults()`; bump SETTINGS_VERSION only when
 * an existing setting changes meaning (new keys merge in automatically).
 */

const STORAGE_KEY = 'undercroft.settings';
const SETTINGS_VERSION = 1;

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface ControlSettings {
	/** Multiplier on the base look speed. */
	mouseSensitivity: number;
	invertY: boolean;
}

export interface GraphicsSettings {
	/** Vertical field of view in degrees. */
	fov: number;
	/** Tone-mapping exposure; calibrated by the player. */
	brightness: number;
	quality: GraphicsQuality;
	/** Camera shake when hurt, 0 (off) .. 1. */
	cameraShake: number;
}

export type CaptionSize = 'small' | 'medium' | 'large';

export interface AccessibilitySettings {
	/** Subtitles and sound captions: show what is heard as text. */
	captions: boolean;
	captionSize: CaptionSize;
}

export interface Settings {
	version: number;
	audio: Record<AudioCategory, number>;
	bindings: Bindings;
	interface: {
		showStats: boolean;
		/** The quick-slot bar at the bottom of the screen. */
		quickSlots: boolean;
		/** "Press E to pick up ..." prompts for things on the floor. */
		itemPrompts: boolean;
	};
	controls: ControlSettings;
	graphics: GraphicsSettings;
	accessibility: AccessibilitySettings;
	/** Who the player is to others, until accounts exist. */
	profile: { name: string };
}

function defaults(): Settings {
	return {
		version: SETTINGS_VERSION,
		audio: { master: 0.8, music: 0.6, ambience: 0.8, sfx: 0.8 },
		bindings: defaultBindings(),
		interface: { showStats: false, quickSlots: true, itemPrompts: true },
		controls: { mouseSensitivity: 1, invertY: false },
		graphics: { fov: 75, brightness: 1, quality: 'high', cameraShake: 1 },
		accessibility: { captions: false, captionSize: 'medium' },
		profile: { name: '' }
	};
}

function load(): Settings {
	const base = defaults();
	try {
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
		if (!raw) return base;
		const saved = JSON.parse(raw) as Partial<Settings>;
		if (saved.version !== SETTINGS_VERSION) return base;
		return {
			...base,
			audio: { ...base.audio, ...saved.audio },
			bindings: { ...base.bindings, ...saved.bindings },
			interface: { ...base.interface, ...saved.interface },
			controls: { ...base.controls, ...saved.controls },
			graphics: { ...base.graphics, ...saved.graphics },
			accessibility: { ...base.accessibility, ...saved.accessibility },
			profile: { ...base.profile, ...saved.profile }
		};
	} catch {
		return base;
	}
}

export const settings: Settings = $state(load());

export function saveSettings(): void {
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Storage can be unavailable (private mode); settings still apply for this session.
	}
}

export function resetSettings(): void {
	Object.assign(settings, defaults());
	saveSettings();
}

export function setBinding(action: Action, codes: string[]): void {
	settings.bindings[action] = codes;
	saveSettings();
}
