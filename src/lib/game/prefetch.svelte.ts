import { prefetchCore, type LoadProgress } from './preload.ts';

/**
 * The hub's background download of the shared assets (see `prefetchCore` in preload.ts). Kept
 * at module level, so it starts once and its progress survives moving between hub pages.
 */
export const prefetch = $state<{ progress: LoadProgress | null; done: boolean }>({
	progress: null,
	done: false
});

let started = false;

/** Start the download (once per page load). */
export function startPrefetch(): void {
	if (started) return;
	started = true;
	void prefetchCore((progress) => (prefetch.progress = progress)).finally(
		() => (prefetch.done = true)
	);
}
