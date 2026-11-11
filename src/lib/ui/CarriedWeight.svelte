<script lang="ts">
	import { CARRY } from '#lib/content/carry.ts';
	import { carriedWeight } from '#lib/shared/items/inventory.ts';
	import type { Inventory } from '#lib/shared/player/types.ts';

	/**
	 * What an inventory weighs against the most that can be carried, e.g. "3.3 / 30 kg". It turns
	 * to the accent colour once the load is enough to slow you down.
	 */
	interface Props {
		inventory: Inventory;
	}

	let { inventory }: Props = $props();

	const weight = $derived(carriedWeight(inventory));
	const slowed = $derived(weight > CARRY.comfortable);
</script>

<span
	class="weight"
	class:slowed
	title={slowed ? 'Enough to slow you down' : 'What you are carrying, and the most you can'}
>
	<span class="hidden">Weight: </span>{weight.toFixed(1)} / {CARRY.max} kg
</span>

<style>
	.weight {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.weight.slowed {
		color: var(--accent);
	}

	/* Read out, not seen. */
	.hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
