<script lang="ts">
	import { bindingLabel, type Action } from '#lib/game/input/actions.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import type { MapDebugCounts } from '#lib/shared/map/debug.ts';

	/**
	 * Dev only: down the left of the map debug view, what the map is made of, with the grid's
	 * colours (see docs/dev/map-generation.md#debug-grid).
	 */
	let { counts, seed, freecam }: { counts: MapDebugCounts; seed: number | null; freecam: boolean } =
		$props();

	/** An action's first key, as bound now. */
	const key = (action: Action): string => {
		const code = settings.bindings[action][0];
		return code ? bindingLabel(code) : 'unbound';
	};

	const roomParts = $derived(
		[
			['start', counts.rooms.start],
			['major', counts.rooms.major],
			['extraction', counts.rooms.extraction],
			['minor', counts.rooms.minor]
		].filter(([, count]) => count)
	);
</script>

<aside class="panel" aria-label="Map debug">
	<h2>Map {seed ?? '—'}</h2>
	<dl>
		<dt><i class="swatch room"></i>Rooms</dt>
		<dd>{counts.rooms.total}</dd>
		{#each roomParts as [name, count] (name)}
			<dt class="sub">{name}</dt>
			<dd class="sub">{count}</dd>
		{/each}
		<dt><i class="swatch tunnel"></i>Tunnels</dt>
		<dd>{counts.tunnels}</dd>
		<dt>Dead ends</dt>
		<dd>{counts.deadEnds}</dd>
		<dt>Caps</dt>
		<dd>{counts.caps}</dd>
		<dt><i class="swatch connected"></i>Connected</dt>
		<dd>{counts.entrances.connected}</dd>
		<dt><i class="swatch blocked"></i>Blocked</dt>
		<dd>{counts.entrances.blocked}</dd>
		<dt>Cells</dt>
		<dd>{counts.cells}</dd>
		<dt>Levels</dt>
		<dd>{counts.levels}</dd>
	</dl>
	<h3>Pieces</h3>
	<dl>
		{#each counts.pieces as { piece, count, room } (piece)}
			<dt><i class="swatch" class:room class:tunnel={!room}></i>{piece}</dt>
			<dd>{count}</dd>
		{/each}
	</dl>
	{#if freecam}
		<p>
			{key('interact')}: move your body here<br />
			{key('reload')}: camera back to your body<br />
			{key('toggleFreecam')}: back into your body
		</p>
	{:else}
		<p>{key('toggleFreecam')}: free camera</p>
	{/if}
</aside>

<style>
	.panel {
		position: fixed;
		top: 50%;
		left: 8px;
		transform: translateY(-50%);
		max-height: calc(100vh - 16px);
		overflow: hidden;
		width: 15rem;
		padding: 10px 12px;
		font:
			12px/1.45 ui-monospace,
			monospace;
		color: #e6e6e6;
		background: rgb(0 0 0 / 0.7);
		border-radius: 4px;
		pointer-events: none;
		z-index: 10;
	}

	h2,
	h3 {
		margin: 0 0 6px;
		font-size: 13px;
		font-weight: 600;
	}

	h3 {
		margin-top: 10px;
		color: #b0b0b0;
	}

	dl {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 1px 12px;
		margin: 0;
	}

	dt {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	dd {
		margin: 0;
		text-align: right;
	}

	.sub {
		padding-left: 16px;
		color: #a8a8a8;
	}

	.swatch {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		background: transparent;
	}

	.room {
		background: rgb(245 211 58 / 0.6);
	}

	.tunnel {
		border: 1px solid #9a9a9a;
	}

	.connected {
		background: #3ddc6a;
	}

	.blocked {
		background: #e5484d;
	}

	p {
		margin: 10px 0 0;
		color: #8a8a8a;
	}
</style>
