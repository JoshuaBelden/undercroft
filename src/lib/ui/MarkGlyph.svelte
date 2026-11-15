<script lang="ts">
	import { MARK_SYMBOLS } from '#lib/content/marks.ts';

	/**
	 * One chalk symbol drawn from its strokes, filling its box. The same strokes draw the mark on
	 * the wall (src/lib/game/items/Marks.ts), so a symbol needs no art.
	 */
	interface Props {
		symbol: string;
	}

	let { symbol }: Props = $props();

	/** The strokes as SVG polylines, in a 100 x 100 box. */
	const lines = $derived(
		(MARK_SYMBOLS[symbol]?.strokes ?? []).map((stroke) =>
			stroke.map(([x, y]) => `${(x * 100).toFixed(1)},${(y * 100).toFixed(1)}`).join(' ')
		)
	);
</script>

<svg viewBox="0 0 100 100" aria-hidden="true">
	{#each lines as points, i (i)}
		<polyline {points} />
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	polyline {
		fill: none;
		stroke: #e9e4d8;
		stroke-width: 7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
