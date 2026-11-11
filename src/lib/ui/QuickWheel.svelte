<script lang="ts">
	import { ITEMS } from '#lib/content/items.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';

	/**
	 * The quick-use wheel: the quick-use slots around a circle, shown while its key is held. The
	 * mouse moves a pointer from the centre; the slot it points at is lit, and letting go of the
	 * key takes that item in the hand. `wheelChoice` is the rule for which slot that is.
	 */
	interface Props {
		/** The quick-use slots, in order; the first is at the top and they go clockwise. */
		slots: (ItemStack | null)[];
		/** The pointer from the centre, each axis -1..1. */
		pointer: { x: number; y: number };
		/** The slot the pointer is on (`wheelChoice`), or -1. */
		chosen: number;
	}

	let { slots, pointer, chosen }: Props = $props();

	/** Distance of the slots from the centre, and how far the pointer travels (pixels). */
	const RADIUS = 150;
	const REACH = 60;

	const places = $derived(
		slots.map((stack, index) => {
			const angle = (index / slots.length) * Math.PI * 2;
			return {
				stack,
				index,
				x: Math.sin(angle) * RADIUS,
				y: -Math.cos(angle) * RADIUS
			};
		})
	);
	const chosenName = $derived.by(() => {
		const stack = slots[chosen];
		return stack ? (ITEMS[stack.item]?.name ?? stack.item) : '';
	});
</script>

<div class="wheel" role="status" aria-label="Quick use">
	<div class="ring"></div>
	{#each places as place (place.index)}
		<div
			class="segment"
			class:empty={!place.stack}
			class:chosen={place.index === chosen}
			style:translate="{place.x}px {place.y}px"
		>
			{#if place.stack}
				<span class="name">{ITEMS[place.stack.item]?.name ?? place.stack.item}</span>
				{#if place.stack.count > 1}
					<span class="count">×{place.stack.count}</span>
				{/if}
			{/if}
		</div>
	{/each}
	<div class="dot" style:translate="{pointer.x * REACH}px {pointer.y * REACH}px"></div>
	<p class="label">{chosenName || 'Quick use'}</p>
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
		width: 92px;
		height: 92px;
		margin: -46px 0 0 -46px;
		display: grid;
		place-items: center;
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: rgb(14 12 10 / 0.85);
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.2;
		text-align: center;
	}

	.segment.empty {
		opacity: 0.35;
	}

	.segment.chosen {
		border-color: var(--text);
		background: rgb(0 129 157 / 0.45);
		scale: 1.1;
	}

	.count {
		position: absolute;
		right: 8px;
		bottom: 5px;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
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
