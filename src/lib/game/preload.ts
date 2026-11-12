import { AFFLICTIONS } from '#lib/content/afflictions.ts';
import { AUDIO_BYTES, AUDIO_FILES } from '#lib/content/audio/files.generated.ts';
import { CREATURES } from '#lib/content/creatures.ts';
import { ITEMS } from '#lib/content/items.ts';
import { modelBytes, modelUrl } from '#lib/content/models.ts';
import { PLAYER_MODEL } from '#lib/content/player/model.ts';
import type { AudioManager } from '#lib/game/audio/AudioManager.ts';
import { warmCharacter, warmModel } from '#lib/game/assets.ts';
import { PIECES } from '#lib/shared/map/pieces.generated.ts';
import type { MapLayout, PieceDef } from '#lib/shared/map/types.ts';

/**
 * Loads assets ahead of time so nothing pops in mid-run (late footsteps, a creature drawn
 * seconds after it arrives). See docs/dev/asset-pipeline.md (Preloading).
 *
 * - `prefetchCore` runs in the hub: every shared model goes into the loader caches, every sound
 *   into the browser's HTTP cache. Affliction-owned files wait for the run that needs them.
 * - `preloadRun` runs on descent, behind the loading bar: the map's pieces, the creatures and
 *   the Affliction's own models, and every sound decoded and ready to play.
 */

/** Bytes loaded so far of the total (sizes from the build manifests). */
export interface LoadProgress {
	loaded: number;
	total: number;
}

interface Task {
	bytes: number;
	load: () => Promise<unknown>;
}

/** Requests in flight at once. */
const PARALLEL = 6;

/** Run tasks a few at a time, reporting progress. A failed file is skipped, not fatal. */
async function run(tasks: Task[], onProgress: (progress: LoadProgress) => void): Promise<void> {
	const total = tasks.reduce((sum, task) => sum + task.bytes, 0);
	let loaded = 0;
	let next = 0;
	onProgress({ loaded, total });
	const worker = async () => {
		while (next < tasks.length) {
			const task = tasks[next++];
			try {
				await task.load();
			} catch (error) {
				console.warn('Preload failed', error);
			}
			loaded += task.bytes;
			onProgress({ loaded, total });
		}
	};
	await Promise.all(Array.from({ length: Math.min(PARALLEL, tasks.length) }, worker));
}

const characters = (urls: string[]): Task[] =>
	[...new Set(urls)].map((url) => ({ bytes: modelBytes(url), load: () => warmCharacter(url) }));

const models = (urls: string[]): Task[] =>
	[...new Set(urls)].map((url) => ({ bytes: modelBytes(url), load: () => warmModel(url) }));

/** Models every run uses, whatever the map: the explorer, creatures, items, crates. */
function sharedModels(): Task[] {
	return [
		...characters([PLAYER_MODEL.model, ...Object.values(CREATURES).map((c) => c.model)]),
		...models([
			modelUrl('shared/props/crate.glb'),
			modelUrl('shared/props/corpse.glb'),
			...Object.values(ITEMS).flatMap((item) => (item.model ? [item.model] : []))
		])
	];
}

const pieceTasks = (pieces: PieceDef[]): Task[] =>
	pieces.map((piece) => ({ bytes: piece.bytes, load: () => warmModel(piece.url) }));

const SOUND_URLS = [...new Set(Object.values(AUDIO_FILES).flat())];

/** Hub: warm the caches with everything shared, at low priority. */
export function prefetchCore(onProgress: (progress: LoadProgress) => void): Promise<void> {
	const pieces = Object.values(PIECES).filter((piece) => !piece.url.includes('/afflictions/'));
	return run(
		[
			...sharedModels(),
			...pieceTasks(pieces),
			...SOUND_URLS.map((url) => ({
				bytes: AUDIO_BYTES[url] ?? 0,
				load: () => fetch(url, { priority: 'low' }).then((response) => response.arrayBuffer())
			}))
		],
		onProgress
	);
}

/** Descent: everything this map and its Affliction need, decoded and ready. */
export function preloadRun(
	layout: MapLayout,
	audio: AudioManager,
	onProgress: (progress: LoadProgress) => void
): Promise<void> {
	const pieces = [...new Set(layout.placements.map((p) => p.piece))].flatMap((name) =>
		PIECES[name] ? [PIECES[name]] : []
	);
	const body = layout.affliction ? AFFLICTIONS[layout.affliction]?.manifestation.body : undefined;
	return run(
		[
			...pieceTasks(pieces),
			...sharedModels(),
			...characters(body ? [body.model] : []),
			...SOUND_URLS.map((url) => ({ bytes: AUDIO_BYTES[url] ?? 0, load: () => audio.load(url) }))
		],
		onProgress
	);
}
