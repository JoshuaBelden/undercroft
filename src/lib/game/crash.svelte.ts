import { SvelteSet } from 'svelte/reactivity';
import { IGNORED_ERRORS } from '#lib/content/reports.ts';
import type { CrashInfo } from '#lib/shared/reports.ts';

/**
 * The crash prompt: when something breaks (in the browser, on the site's server, or on the game
 * server), the player is asked whether to send a report about it. Nothing is sent unless they
 * say yes. Each error asks once per page load. See docs/dev/reports.md#crashes.
 */
export const crashes: { pending: CrashInfo | null } = $state({ pending: null });

/** The bug report form is open; `crash` is attached to it, if it came from the prompt. */
export const bugReport: { open: boolean; crash: CrashInfo | null } = $state({
	open: false,
	crash: null
});

const asked = new SvelteSet<string>();

/** Ask about an error, unless it was asked about already or isn't ours to report. */
export function promptCrash(crash: CrashInfo): void {
	if (IGNORED_ERRORS.some((start) => crash.message.startsWith(start))) return;
	const key = `${crash.source}:${crash.message}`;
	if (asked.has(key)) return;
	asked.add(key);
	// One at a time: a second error while the first is showing waits for nothing (it's in the console).
	crashes.pending ??= crash;
}

/** Open the bug report form, with a crash attached or not. */
export function openBugReport(crash: CrashInfo | null = null): void {
	crashes.pending = null;
	bugReport.crash = crash;
	bugReport.open = true;
	// The game view holds the mouse: let it go, so the form can be used.
	if (document.pointerLockElement) document.exitPointerLock();
}

export function closeBugReport(): void {
	bugReport.open = false;
	bugReport.crash = null;
}

/** A thrown value as a crash. */
export function crashFrom(error: unknown, source: CrashInfo['source']): CrashInfo {
	if (error instanceof Error) {
		const crash: CrashInfo = { source, message: `${error.name}: ${error.message}` };
		if (error.stack) crash.stack = error.stack;
		return crash;
	}
	return { source, message: String(error) };
}

/** Whether an error came from our own scripts (not a browser extension or another site's). */
function ours(file: string | undefined, stack: string | undefined): boolean {
	const origin = location.origin;
	if (file) return file.startsWith(origin);
	return Boolean(stack?.includes(origin));
}

/** Watch for errors nobody caught. Called once, from src/hooks.client.ts. */
export function watchCrashes(): void {
	window.addEventListener('error', (event) => {
		// A resource that failed to load (an image, a script) has no error to report.
		if (!(event instanceof ErrorEvent) || !event.message) return;
		const error = event.error as unknown;
		const stack = error instanceof Error ? error.stack : undefined;
		if (!ours(event.filename, stack)) return;
		promptCrash(
			error === undefined
				? { source: 'client', message: event.message }
				: crashFrom(error, 'client')
		);
	});
	window.addEventListener('unhandledrejection', (event) => {
		const reason = event.reason as unknown;
		const stack = reason instanceof Error ? reason.stack : undefined;
		if (!ours(undefined, stack)) return;
		promptCrash(crashFrom(reason, 'client'));
	});
}
