import type { HandleClientError } from '@sveltejs/kit/hooks';
import { crashFrom, promptCrash, watchCrashes } from '#lib/game/crash.svelte.ts';
import { captureConsole } from '#lib/game/diagnostics.ts';

/**
 * In the browser, from the start: keep the latest console warnings and errors for bug reports,
 * and watch for errors nobody caught, so the player can be asked to report them.
 * See docs/dev/reports.md.
 */
captureConsole();
watchCrashes();

/** An error while loading or showing a page. Only our own bugs prompt (not a 404, not `error()`). */
export const handleError: HandleClientError = ({ error, kind }) => {
	if (kind === 'unknown') promptCrash(crashFrom(error, 'client'));
	console.error(error);
};
