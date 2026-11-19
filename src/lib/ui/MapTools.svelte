<script lang="ts">
	import { levelNumber } from './mapSketch.ts';
	import type { MapView } from './mapView.svelte.ts';

	/**
	 * The map's own buttons, in the middle of the in-game menu's header while the Map tab shows
	 * (docs/dev/map.md): the level above and below, which level this is, and Find me.
	 */
	interface Props {
		view: MapView;
	}

	let { view }: Props = $props();
</script>

<div class="tools" role="toolbar" aria-label="Map">
	<button
		type="button"
		class="pill"
		aria-label="Level above"
		disabled={view.first}
		onclick={() => view.changeLevel(-1)}
	>
		Up
	</button>
	<span class="level">Level {levelNumber(view.level)}</span>
	<button
		type="button"
		class="pill"
		aria-label="Level below"
		disabled={view.last}
		onclick={() => view.changeLevel(1)}
	>
		Down
	</button>
	<button type="button" class="pill" onclick={() => view.findMe()}>Find me</button>
</div>

<style>
	.tools {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.level {
		min-width: 5.5em;
		text-align: center;
		font-family: var(--font-lore);
	}

	.pill {
		padding: 6px 16px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: none;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.pill:hover:not(:disabled),
	.pill:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	.pill:disabled {
		opacity: 0.4;
	}
</style>
