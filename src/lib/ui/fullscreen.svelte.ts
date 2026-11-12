import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';

/**
 * Fullscreen for the whole site. The document itself goes fullscreen, not one page's element,
 * so it lasts across every move between pages: the dashboard, the settings and the expedition.
 * `settings.graphics.fullscreen` remembers the choice; browsers only allow fullscreen from a
 * click or a key, so a saved choice is taken up again on the first one after the page loads.
 * See docs/dev/systems.md#fullscreen.
 */

/** The keyboard lock API (Chromium only), not yet in the DOM types. */
interface KeyboardLock {
	lock(codes?: string[]): Promise<void>;
	unlock(): void;
}

export const fullscreen = $state({ active: false });

function keyboard(): KeyboardLock | undefined {
	return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
}

function remember(on: boolean): void {
	if (settings.graphics.fullscreen === on) return;
	settings.graphics.fullscreen = on;
	saveSettings();
}

/** Fullscreen on (or off). Must be called from a click or key press. */
export function setFullscreen(on: boolean): void {
	remember(on);
	if (on && !document.fullscreenElement) {
		document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
			// Refused (no click or key behind it, or not allowed here): it stays windowed.
		});
	} else if (!on && document.fullscreenElement) {
		void document.exitFullscreen();
	}
}

export function toggleFullscreen(): void {
	setFullscreen(!fullscreen.active);
}

/**
 * Keeps `fullscreen.active` true to the browser, and takes up the saved choice on the first click
 * or key. Call once, from the root layout; returns the teardown.
 */
export function watchFullscreen(): () => void {
	const sync = (): void => {
		fullscreen.active = document.fullscreenElement !== null;
	};

	const changed = (): void => {
		sync();
		if (fullscreen.active) {
			// Escape is a game key (the settings menu): while fullscreen, the browser hands it to the
			// page, and holding it leaves fullscreen instead. Where this is not supported, Escape
			// leaves fullscreen at once.
			keyboard()
				?.lock(['Escape'])
				.catch(() => {});
		} else {
			keyboard()?.unlock();
			// Left by the browser's own way out (holding Escape, F11): remembered as windowed.
			remember(false);
		}
	};

	const restore = (event: Event): void => {
		// The fullscreen key does its own toggling.
		if (event instanceof KeyboardEvent && settings.bindings.toggleFullscreen.includes(event.code)) {
			return;
		}
		window.removeEventListener('pointerdown', restore, true);
		window.removeEventListener('keydown', restore, true);
		if (settings.graphics.fullscreen && !document.fullscreenElement) setFullscreen(true);
	};

	document.addEventListener('fullscreenchange', changed);
	window.addEventListener('pointerdown', restore, true);
	window.addEventListener('keydown', restore, true);
	sync();

	return () => {
		document.removeEventListener('fullscreenchange', changed);
		window.removeEventListener('pointerdown', restore, true);
		window.removeEventListener('keydown', restore, true);
	};
}
