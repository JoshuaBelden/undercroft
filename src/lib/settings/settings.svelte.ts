import {
	defaultBindings,
	defaultPadBindings,
	type Action,
	type Bindings
} from '#lib/game/input/actions.ts';
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
	/** Multiplier on the look speed while aiming down sights (on top of mouseSensitivity). */
	aimSensitivity: number;
	invertY: boolean;
}

/** The controller's sprint button: a click starts and the run ends itself, or held like the key. */
export type SprintMode = 'toggle' | 'hold';

/** Which controller icons to show: as detected, or always one set. */
export type ButtonIcons = 'auto' | 'xbox' | 'playstation';

/** See docs/dev/controller.md. */
export interface ControllerSettings {
	/** Multiplier on the right stick's top turn speed. */
	lookSensitivity: number;
	invertY: boolean;
	/** How far (0..1) a stick must be pushed before it counts. */
	deadZone: number;
	vibration: boolean;
	sprint: SprintMode;
	icons: ButtonIcons;
}

/** Through the explorer's eyes, or from behind their shoulder. */
export type CameraView = 'first' | 'shoulder';

export interface GraphicsSettings {
	view: CameraView;
	/** Vertical field of view in degrees. */
	fov: number;
	/** Tone-mapping exposure; calibrated by the player. */
	brightness: number;
	quality: GraphicsQuality;
	/** Camera shake when hurt, 0 (off) .. 1. */
	cameraShake: number;
	/** The whole site fills the screen (see src/lib/ui/fullscreen.svelte.ts). */
	fullscreen: boolean;
	/** Fraction of the quality preset's resolution actually rendered, 0.5 .. 1. */
	renderScale: number;
	/** Frames per second at most; 0 = as many as the screen shows. */
	frameCap: FrameCap;
}

export const FRAME_CAPS = [0, 30, 60] as const;
export type FrameCap = (typeof FRAME_CAPS)[number];

export type CaptionSize = 'small' | 'medium' | 'large';

export interface AccessibilitySettings {
	/** Subtitles and sound captions: show what is heard as text. */
	captions: boolean;
	captionSize: CaptionSize;
	/** Steadier lamp flicker and cut-outs, and a softer muzzle flash (photosensitivity). */
	reduceFlashing: boolean;
	/** Sprint and aim: press once to start, again to stop, instead of holding the key. */
	toggleSprint: boolean;
	toggleAim: boolean;
	/** Both ears hear the same: everything is mixed to mono. */
	monoAudio: boolean;
}

export interface SoundSettings {
	/** Silence the game while its tab or window isn't the one in front. */
	muteInBackground: boolean;
}

export interface Settings {
	version: number;
	audio: Record<AudioCategory, number>;
	sound: SoundSettings;
	bindings: Bindings;
	/** Controller buttons per action, apart from the keys so new defaults reach saved settings. */
	padBindings: Bindings;
	interface: {
		showStats: boolean;
		/** What is in your hand, named at the bottom of the screen. */
		quickSlots: boolean;
		/** "Press E to pick up ..." prompts for things on the floor. */
		itemPrompts: boolean;
	};
	controls: ControlSettings;
	controller: ControllerSettings;
	graphics: GraphicsSettings;
	accessibility: AccessibilitySettings;
}

function defaults(): Settings {
	return {
		version: SETTINGS_VERSION,
		audio: { master: 0.8, music: 0.6, ambience: 0.8, sfx: 0.8 },
		sound: { muteInBackground: false },
		bindings: defaultBindings(),
		padBindings: defaultPadBindings(),
		interface: { showStats: false, quickSlots: true, itemPrompts: true },
		controls: { mouseSensitivity: 1, aimSensitivity: 1, invertY: false },
		controller: {
			lookSensitivity: 1,
			invertY: false,
			deadZone: 0.15,
			vibration: true,
			sprint: 'toggle',
			icons: 'auto'
		},
		graphics: {
			view: 'first',
			fov: 75,
			brightness: 1,
			quality: 'high',
			cameraShake: 1,
			fullscreen: false,
			renderScale: 1,
			frameCap: 0
		},
		accessibility: {
			captions: false,
			captionSize: 'medium',
			reduceFlashing: false,
			toggleSprint: false,
			toggleAim: false,
			monoAudio: false
		}
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
			sound: { ...base.sound, ...saved.sound },
			bindings: knownBindings(base.bindings, saved.bindings),
			padBindings: knownBindings(base.padBindings, saved.padBindings),
			interface: { ...base.interface, ...saved.interface },
			controls: { ...base.controls, ...saved.controls },
			controller: { ...base.controller, ...saved.controller },
			graphics: { ...base.graphics, ...saved.graphics },
			accessibility: { ...base.accessibility, ...saved.accessibility }
		};
	} catch {
		return base;
	}
}

/** Saved bindings over the defaults, leaving out actions that no longer exist. */
function knownBindings(base: Bindings, saved: Partial<Bindings> | undefined): Bindings {
	const result = { ...base };
	for (const action of Object.keys(base) as Action[]) {
		const codes = saved?.[action];
		if (Array.isArray(codes)) result[action] = codes;
	}
	return result;
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
