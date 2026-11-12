<script lang="ts">
	import { MARK_SYMBOLS } from '#lib/content/marks.ts';

	/**
	 * The chalk wheel: the symbols on the player's wheel around a circle, shown while attack is
	 * held with chalk in the hand. The mouse moves a pointer from the centre; the symbol it points
	 * at is lit, and letting go draws it on the wall. `wheelChoice` is the rule for which one.
	 */
	interface Props {
		/** Symbol ids, in order; the first is at the top and they go clockwise. */
		symbols: readonly string[];
		/** The pointer from the centre, each axis -1..1. */
		pointer: { x: number; y: number };
		/** The symbol the pointer is on (`wheelChoice`), or -1. */
		chosen: number;
	}

	let { symbols, pointer, chosen }: Props = $props();

	/** Distance of the symbols from the centre, and how far the pointer travels (pixels). */
	const RADIUS = 150;
	const REACH = 60;

	const places = $derived(
		symbols.map((id, index) => {
			const angle = (index / symbols.length) * Math.PI * 2;
			const def = MARK_SYMBOLS[id];
			return {
				id,
				index,
				// The strokes as SVG polylines, in a 100 x 100 box.
				lines: (def?.strokes ?? []).map((stroke) =>
					stroke.map(([x, y]) => `${(x * 100).toFixed(1)},${(y * 100).toFixed(1)}`).join(' ')
				),
				x: Math.sin(angle) * RADIUS,
				y: -Math.cos(angle) * RADIUS
			};
		})
	);
	const chosenName = $derived(MARK_SYMBOLS[symbols[chosen] ?? '']?.name ?? '');
</script>

<div class="wheel" role="status" aria-label="Chalk mark">
	<div class="ring"></div>
	{#each places as place (place.id)}
		<div
			class="segment"
			class:chosen={place.index === chosen}
			style:translate="{place.x}px {place.y}px"
		>
			<svg viewBox="0 0 100 100" aria-hidden="true">
				{#each place.lines as points, i (i)}
					<polyline {points} />
				{/each}
			</svg>
		</div>
	{/each}
	<div class="dot" style:translate="{pointer.x * REACH}px {pointer.y * REACH}px"></div>
	<p class="label">{chosenName || 'Chalk'}</p>
</div>

<style>
	.wheel {
		position: fixed;
		left: 50%;
		top: 50%;
		z-index: 15;
		pointer-events: none;
	}

	/* Everything is placed from the centre of the screen. */
	.wheel > * {
		position: absolute;
		left: 0;
		top: 0;
	}

	.ring {
		width: 420px;
		height: 420px;
		margin: -210px 0 0 -210px;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			rgb(0 0 0 / 0.15) 30%,
			rgb(0 0 0 / 0.6) 72%,
			transparent 73%
		);
	}

	.segment {
		width: 80px;
		height: 80px;
		margin: -40px 0 0 -40px;
		display: grid;
		place-items: center;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: rgb(14 12 10 / 0.85);
	}

	.segment.chosen {
		border-color: var(--text);
		background: rgb(0 129 157 / 0.45);
		scale: 1.1;
	}

	svg {
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

	.dot {
		width: 8px;
		height: 8px;
		margin: -4px 0 0 -4px;
		border-radius: 50%;
		background: var(--text);
	}

	.label {
		width: 200px;
		margin: 28px 0 0 -100px;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-align: center;
		text-transform: uppercase;
		color: var(--text);
	}
</style>
