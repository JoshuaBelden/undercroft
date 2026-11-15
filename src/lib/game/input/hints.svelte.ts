/**
 * What the controller's menus show on screen (`ButtonHint.svelte`), kept up to date by menus.ts:
 * which menu has the controller (menu buttons only work in it), and the hold under way, for the
 * slide across its control. See docs/dev/controller.md.
 */
export const hints = $state({
	/** The root of the menu the controller drives, or null when none is open. */
	top: null as HTMLElement | null,
	/** The control a menu button is being held for (`data-pad-hold`), if any. */
	target: null as HTMLElement | null,
	/** How far that hold has got, 0..1. */
	progress: 0
});
