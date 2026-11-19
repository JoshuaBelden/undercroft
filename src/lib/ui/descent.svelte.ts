import { EXPEDITION } from '#lib/content/expedition.ts';

/**
 * The dark between the launch countdown and the start room (docs/dev/expedition.md#the-descent):
 * the screen goes black the moment the count runs out, stays black while the page changes and
 * the run loads, then fades into the room. Drawn by `DescentVeil` in the root layout.
 */
export const descent = $state({
	/** Black over everything. */
	dark: false,
	/** Fading from black into the room. */
	fading: false
});

let timer: ReturnType<typeof setTimeout> | null = null;

function settle(dark: boolean, fading: boolean, after?: number): void {
	if (timer) clearTimeout(timer);
	timer = null;
	descent.dark = dark;
	descent.fading = fading;
	if (after !== undefined) timer = setTimeout(() => settle(false, false), after * 1000);
}

/** The count ran out: go dark. If the run never arrives, the dark lifts on its own. */
export function darken(): void {
	if (descent.dark && !descent.fading) return;
	settle(true, false, EXPEDITION.descentGiveUpSeconds);
}

/** The run has arrived and is loading: stay dark however long that takes. */
export function holdDark(): void {
	if (descent.dark && !descent.fading) settle(true, false);
}

/** The run is loaded and drawing: fade from black into it. */
export function reveal(): void {
	if (!descent.dark || descent.fading) return;
	settle(true, true, EXPEDITION.arriveFadeSeconds);
}
