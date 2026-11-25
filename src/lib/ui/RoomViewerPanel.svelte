<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROOM_BUDGET, MARKER_COLOURS } from '#lib/content/map/roomViewer.ts';
	import { bindingLabel, type Action } from '#lib/game/input/actions.ts';
	import type { RoomFile } from '#lib/game/rooms/files.ts';
	import type { RoomStats, RoomToggles, RoomViewMode } from '#lib/game/rooms/RoomViewer.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import {
		ROOM_MARKER_KINDS,
		soundOf,
		type RoomManifest,
		type RoomMarker
	} from '#lib/shared/map/room.ts';
	import { SOUNDS, type SoundDef } from '#lib/content/audio/sounds.ts';
	import { AUDIO_FILES } from '#lib/content/audio/files.generated.ts';

	/** The room viewer's side panel: the room, its toggles, its markers and its cost. */
	interface Props {
		name: string;
		file: RoomFile | null;
		manifest: RoomManifest | null;
		stats: RoomStats | null;
		toggles: RoomToggles | null;
		mode: RoomViewMode;
		hasLightmap: boolean;
		problem: string | null;
		/** When the room was last loaded again after a re-export (performance.now()), or 0. */
		reloadedAt: number;
		ontoggle: (key: keyof RoomToggles) => void;
		onmode: (mode: RoomViewMode) => void;
		ongoto: (marker: RoomMarker) => void;
	}

	let {
		name,
		file,
		manifest,
		stats,
		toggles,
		mode,
		hasLightmap,
		problem,
		reloadedAt,
		ontoggle,
		onmode,
		ongoto
	}: Props = $props();

	const key = (action: Action) => {
		const code = settings.bindings[action][0];
		return code ? bindingLabel(code) : '–';
	};

	const TOGGLES: { key: keyof RoomToggles; label: string; action?: Action }[] = [
		{ key: 'colliders', label: 'Collision boxes', action: 'roomColliders' },
		{ key: 'volumes', label: 'Volumes' },
		{ key: 'markers', label: 'Markers', action: 'roomMarkers' },
		{ key: 'labels', label: 'Marker names' },
		{ key: 'lightmap', label: 'Lightmap', action: 'roomLightmap' },
		{ key: 'fullbright', label: 'Even light', action: 'roomFullbright' },
		{ key: 'headlamp', label: 'Headlamp' }
	];

	/** The room's markers by kind, the kinds it has, in their usual order. */
	const kinds = $derived(
		ROOM_MARKER_KINDS.map(
			(kind) => [kind, (manifest?.markers ?? []).filter((m) => m.kind === kind)] as const
		).filter(([, markers]) => markers.length > 0)
	);

	/** The sounds the room's markers name, each recorded or not yet (silent until it is). */
	const sounds = $derived.by(() => {
		const ids = [
			...new Set((manifest?.markers ?? []).filter((m) => m.kind === 'sound').map(soundOf))
		].sort();
		return ids.map((id) => {
			const def = (SOUNDS as Record<string, SoundDef | undefined>)[id];
			const files = def?.file === undefined ? [] : [def.file].flat();
			const recorded =
				files.length > 0 && files.every((file) => (AUDIO_FILES[file] ?? []).length > 0);
			return { id, known: !!def, recorded };
		});
	});

	/** Over the budget: shown in red. */
	const over = $derived({
		triangles: (stats?.triangles ?? 0) > ROOM_BUDGET.triangles,
		drawCalls: (stats?.drawCalls ?? 0) > ROOM_BUDGET.drawCalls,
		textureMB: (stats?.textureMB ?? 0) > ROOM_BUDGET.textureMB,
		texels:
			!!stats?.lightmap &&
			(stats.lightmap.texelsPerMetre < ROOM_BUDGET.texelsPerMetre.min ||
				stats.lightmap.texelsPerMetre > ROOM_BUDGET.texelsPerMetre.max)
	});

	let flash = $state(false);
	$effect(() => {
		if (!reloadedAt) return;
		flash = true;
		const timer = setTimeout(() => (flash = false), 1500);
		return () => clearTimeout(timer);
	});

	const hex = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;
	const fixed = (n: number) => n.toFixed(2);
</script>

<aside class="panel">
	<header>
		<a href={resolve('/dev/room')} class="back">Rooms</a>
		<h1>{name}</h1>
		{#if file}
			<p class="muted">
				{(file.bytes / 1e6).toFixed(1)} MB
				{#if flash}<span class="reloaded">· reloaded</span>{/if}
			</p>
		{/if}
		{#if problem}<p class="problem">{problem}</p>{/if}
	</header>

	<section>
		<h2>Camera</h2>
		<div class="modes">
			<button class:on={mode === 'fly'} onclick={() => onmode('fly')}>Fly</button>
			<button class:on={mode === 'walk'} onclick={() => onmode('walk')}>Walk</button>
			<span class="muted">{key('roomWalk')}</span>
		</div>
		<p class="muted small">
			{mode === 'fly'
				? `Move ${key('moveForward')}${key('moveLeft')}${key('moveBack')}${key('moveRight')}, up ${key('climb')}, down ${key('swimDown')}, faster ${key('sprint')}`
				: `Walk ${key('moveForward')}${key('moveLeft')}${key('moveBack')}${key('moveRight')}, jump and climb ${key('climb')}, stance ${key('stance')}, sprint ${key('sprint')}`}
		</p>
	</section>

	{#if toggles}
		<section>
			<h2>Show</h2>
			{#each TOGGLES as toggle (toggle.key)}
				<label class:disabled={toggle.key === 'lightmap' && !hasLightmap}>
					<input
						type="checkbox"
						checked={toggles[toggle.key]}
						disabled={toggle.key === 'lightmap' && !hasLightmap}
						onchange={() => ontoggle(toggle.key)}
					/>
					{toggle.label}
					{#if toggle.key === 'lightmap' && !hasLightmap}<span class="muted">(none baked)</span
						>{/if}
					{#if toggle.action}<span class="muted key">{key(toggle.action)}</span>{/if}
				</label>
			{/each}
		</section>
	{/if}

	{#if stats}
		<section>
			<h2>Cost</h2>
			<dl>
				<dt>Triangles</dt>
				<dd class:over={over.triangles}>
					{stats.triangles.toLocaleString()} / {ROOM_BUDGET.triangles.toLocaleString()}
				</dd>
				<dt>Draw calls</dt>
				<dd class:over={over.drawCalls}>{stats.drawCalls} / {ROOM_BUDGET.drawCalls}</dd>
				<dt>Textures</dt>
				<dd class:over={over.textureMB}>
					{stats.textures} · {stats.textureMB.toFixed(0)} / {ROOM_BUDGET.textureMB} MB
				</dd>
				<dt>Lightmap</dt>
				<dd class:over={over.texels}>
					{#if stats.lightmap}
						{stats.lightmap.width}×{stats.lightmap.height} · {stats.lightmap.texelsPerMetre.toFixed(
							1
						)} texels/m
					{:else}
						none
					{/if}
				</dd>
				<dt>Frame</dt>
				<dd>{stats.fps} fps · {stats.frameMs.toFixed(1)} ms</dd>
			</dl>
			<p class="muted small">Raw export: textures are full size here; the build shrinks them.</p>
		</section>
	{/if}

	{#if manifest}
		<section>
			<h2>Markers <span class="muted">({manifest.markers.length})</span></h2>
			<p class="muted small">
				{manifest.colliders.length} collision boxes · {manifest.volumes.length} volumes. Click a marker
				to stand there.
			</p>
			{#each kinds as [kind, markers] (kind)}
				<details open={kind === 'spawn'}>
					<summary>
						<span class="swatch" style:background={hex(MARKER_COLOURS[markers[0].kind])}></span>
						{kind} <span class="muted">({markers.length})</span>
					</summary>
					<ul>
						{#each markers as marker (marker.label)}
							<li>
								<button class="link" onclick={() => ongoto(marker)}>{marker.label}</button>
								<span class="muted small">{marker.position.map(fixed).join(', ')}</span>
							</li>
						{/each}
					</ul>
				</details>
			{/each}
			{#if sounds.length}
				<h3>Sounds</h3>
				<ul>
					{#each sounds as sound (sound.id)}
						<li>
							<span>{sound.id}</span>
							<span class:problem={!sound.recorded} class="small">
								{!sound.known ? 'not in sounds.ts' : sound.recorded ? 'recorded' : 'to record'}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
			{#if manifest.warnings.length}
				<h3 class="problem">Warnings</h3>
				<ul class="warnings">
					{#each manifest.warnings as warning (warning)}<li>{warning}</li>{/each}
				</ul>
			{/if}
		</section>
	{/if}
</aside>

<style>
	.panel {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 300px;
		overflow-y: auto;
		padding: 0.75rem 1rem;
		background: rgb(10 9 8 / 88%);
		border-left: 1px solid var(--border);
		color: var(--text);
		font: 0.85rem var(--font-ui);
	}
	h1 {
		margin: 0.25rem 0;
		font: 1.4rem var(--font-display);
	}
	h2 {
		margin: 0 0 0.4rem;
		font: 1rem var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	h3 {
		font-size: 0.85rem;
		margin: 0.6rem 0 0.2rem;
	}
	section {
		padding: 0.6rem 0;
		border-top: 1px solid var(--border);
	}
	p {
		margin: 0.2rem 0;
	}
	.back,
	.link {
		color: var(--accent);
	}
	.link {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		cursor: pointer;
		text-align: left;
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 0.75rem;
	}
	.problem,
	.over {
		color: var(--broken);
	}
	.reloaded {
		color: var(--rarity-rare);
	}
	.modes {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.modes button {
		padding: 0.2rem 0.8rem;
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--border);
		cursor: pointer;
	}
	.modes button.on {
		border-color: var(--accent);
		background: var(--accent);
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.1rem 0;
	}
	label.disabled {
		color: var(--muted);
	}
	.key {
		margin-left: auto;
		font-family: var(--font-mono);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.8rem;
		margin: 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		text-align: right;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	details {
		margin: 0.2rem 0;
	}
	summary {
		cursor: pointer;
	}
	.swatch {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		margin-right: 0.2rem;
	}
	ul {
		list-style: none;
		margin: 0.2rem 0 0.4rem;
		padding-left: 1rem;
	}
	li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.warnings li {
		display: list-item;
		color: var(--broken);
		font-size: 0.75rem;
	}
</style>
