<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import type { Action } from '#lib/game/input/actions.ts';
	import { findRoom, onRoomChanged, type RoomFile } from '#lib/game/rooms/files.ts';
	import {
		RoomViewer,
		type RoomStats,
		type RoomToggles,
		type RoomView,
		type RoomViewMode
	} from '#lib/game/rooms/RoomViewer.ts';
	import type { RoomManifest, RoomMarker } from '#lib/shared/map/room.ts';
	import { ROOM_VIEWER } from '#lib/content/map/roomViewer.ts';
	import RoomViewerPanel from '#lib/ui/RoomViewerPanel.svelte';

	/** The room viewer (dev): one room, flown or walked (docs/dev/room-viewer.md). */
	const name = $derived(page.params.room ?? '');

	let canvas: HTMLCanvasElement;
	let labels: HTMLDivElement;
	let viewer = $state.raw<RoomViewer | null>(null);
	let file = $state.raw<RoomFile | null>(null);
	let manifest = $state.raw<RoomManifest | null>(null);
	let stats = $state.raw<RoomStats | null>(null);
	let toggles = $state.raw<RoomToggles | null>(null);
	let mode = $state<RoomViewMode>('fly');
	let hasLightmap = $state(false);
	let problem = $state<string | null>(null);
	let reloadedAt = $state(0);
	let captured = $state(false);

	const VIEWS = 'undercroft.roomViewer.views';

	function savedViews(): Record<string, RoomView> {
		try {
			return JSON.parse(localStorage.getItem(VIEWS) ?? '{}') as Record<string, RoomView>;
		} catch {
			return {};
		}
	}

	function saveView(): void {
		if (!viewer || !file) return;
		const views = savedViews();
		views[file.name] = viewer.view();
		localStorage.setItem(VIEWS, JSON.stringify(views));
	}

	/** Load the room; `again`: it was exported again, so the camera stays put. */
	async function open(room: string, again: boolean): Promise<void> {
		if (!viewer) return;
		try {
			const found = await findRoom(room);
			if (!found) {
				problem = `No room "${room}" in art/export/rooms`;
				return;
			}
			const first = !file || file.name !== found.name;
			if (first && file) saveView();
			file = found;
			manifest = await viewer.load(found);
			hasLightmap = viewer.hasLightmap;
			if (first) {
				viewer.setToggles({ lightmap: hasLightmap, fullbright: !hasLightmap });
				viewer.restore(savedViews()[found.name] ?? viewer.startView());
			}
			if (again) reloadedAt = performance.now();
			toggles = viewer.toggles;
			mode = viewer.mode;
			problem = null;
		} catch (err) {
			if (err instanceof Error && err.message === 'superseded') return;
			problem = err instanceof Error ? err.message : String(err);
		}
	}

	$effect(() => {
		void open(name, false);
	});

	function toggle(key: keyof RoomToggles): void {
		if (!viewer) return;
		viewer.setToggles({ [key]: !viewer.toggles[key] });
		toggles = viewer.toggles;
	}

	function setMode(next: RoomViewMode): void {
		viewer?.setMode(next);
		mode = next;
	}

	function goTo(marker: RoomMarker): void {
		viewer?.goTo(marker);
	}

	const KEYS: Partial<Record<Action, () => void>> = {
		roomWalk: () => setMode(mode === 'fly' ? 'walk' : 'fly'),
		roomColliders: () => toggle('colliders'),
		roomMarkers: () => toggle('markers'),
		roomLightmap: () => toggle('lightmap'),
		roomFullbright: () => toggle('fullbright')
	};

	onMount(() => {
		const input = new InputMap(window, [...(Object.keys(KEYS) as Action[]), 'stance']);
		viewer = new RoomViewer(canvas, labels, input);
		const stopKeys = input.onPressed((action) => KEYS[action]?.());
		const stopChanges = onRoomChanged((changed) => {
			if (file && changed.name === file.name) {
				void open(file.name, true);
			}
		});
		const lock = () => (captured = document.pointerLockElement === canvas);
		document.addEventListener('pointerlockchange', lock);
		const tick = setInterval(() => {
			if (viewer) stats = viewer.stats();
		}, 500);
		const save = setInterval(saveView, ROOM_VIEWER.saveEvery * 1000);
		window.addEventListener('beforeunload', saveView);
		return () => {
			saveView();
			clearInterval(tick);
			clearInterval(save);
			window.removeEventListener('beforeunload', saveView);
			document.removeEventListener('pointerlockchange', lock);
			stopKeys();
			stopChanges();
			viewer?.dispose();
			viewer = null;
			input.dispose();
		};
	});
</script>

<svelte:head><title>{name} · Room viewer</title></svelte:head>

<div class="viewer">
	<canvas bind:this={canvas} onclick={() => void canvas.requestPointerLock()}></canvas>
	<div class="labels" bind:this={labels}></div>
	{#if !captured}
		<p class="hint">Click the room to look around · Esc to let go</p>
	{/if}
	<RoomViewerPanel
		{name}
		{file}
		{manifest}
		{stats}
		{toggles}
		{mode}
		{hasLightmap}
		{problem}
		{reloadedAt}
		ontoggle={toggle}
		onmode={setMode}
		ongoto={goTo}
	/>
</div>

<style>
	.viewer {
		position: fixed;
		inset: 0;
		background: #000;
	}
	canvas,
	.labels {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.labels {
		pointer-events: none;
		overflow: hidden;
	}
	.labels :global(.room-marker-label) {
		font: 11px var(--font-mono);
		text-shadow: 0 0 3px #000;
		white-space: nowrap;
	}
	.hint {
		position: absolute;
		left: 50%;
		bottom: 1.5rem;
		transform: translateX(-50%);
		margin: 0;
		padding: 0.4rem 0.8rem;
		background: rgb(0 0 0 / 60%);
		color: var(--text);
		font: 0.85rem var(--font-ui);
		pointer-events: none;
	}
</style>
