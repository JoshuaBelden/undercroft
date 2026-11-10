import { defaultBindings, type Action, type Bindings } from '#lib/game/input/actions.ts';
import type { AudioCategory } from '#lib/game/audio/AudioManager.ts';

/**
 * All player settings live here and persist to localStorage.
 * Add new settings to `Settings` and `defaults()`; bump SETTINGS_VERSION only when
 * an existing setting changes meaning (new keys merge in automatically).
 */

const STORAGE_KEY = 'undercroft.settings';
const SETTINGS_VERSION = 1;

export interface Settings {
	version: number;
	audio: Record<AudioCategory, number>;
	bindings: Bindings;
	interface: { showStats: boolean };
}

function defaults(): Settings {
	return {
		version: SETTINGS_VERSION,
		audio: { master: 0.8, music: 0.6, ambience: 0.8, sfx: 0.8 },
		bindings: defaultBindings(),
		interface: { showStats: false }
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
			interface: { ...base.interface, ...saved.interface }
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
