import { settings } from '#lib/settings/settings.svelte.ts';
import type { Action, PadFamily } from './actions.ts';

/**
 * The device used last, keyboard and mouse or a controller (`gamepad.ts` keeps it up to date),
 * and the bindings to show for it. See docs/dev/controller.md.
 */

export type InputDevice = 'keyboard' | 'pad';

/**
 * The device used last: it picks the icons in prompts and help, and whether play needs the mouse
 * captured. `lost` is set when the controller in use disconnects, until one connects or the
 * keyboard or mouse is used.
 */
export const device = $state({
	kind: 'keyboard' as InputDevice,
	/** The family of the controller pressed last. */
	detected: 'xbox' as PadFamily,
	lost: false
});

/** The icon set to show: Settings > Controller > Button icons, or as detected. */
export function padFamily(): PadFamily {
	const icons = settings.controller.icons;
	return icons === 'auto' ? device.detected : icons;
}

/**
 * The binding to show for `action`: its controller button while the controller is in use (if it
 * has one), otherwise its first key. '' when it has neither.
 */
export function promptCode(action: Action): string {
	const pad = device.kind === 'pad' ? settings.padBindings[action][0] : undefined;
	return pad ?? settings.bindings[action][0] ?? '';
}

/**
 * Every binding of `action` for the device in use: its controller buttons while the controller is
 * in use (if it has any), otherwise its keys. Help text names actions in plain strings, so an
 * unknown one has none.
 */
export function promptCodes(action: Action): readonly string[] {
	const pad = device.kind === 'pad' ? (settings.padBindings[action] ?? []) : [];
	return pad.length ? pad : (settings.bindings[action] ?? []);
}
