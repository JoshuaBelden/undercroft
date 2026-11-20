<script lang="ts">
	import { ITEMS, rarityOf } from '#lib/content/items.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import ItemTooltip from './ItemTooltip.svelte';
	import Slot from './Slot.svelte';

	/**
	 * A slot showing an item that isn't one you hold (a recipe's product, a discovery), with the
	 * usual item tooltip on hover or focus.
	 */
	interface Props {
		stack: ItemStack;
		/** Shimmering: newly discovered. */
		fresh?: boolean;
		/** Pointed at (for a fresh one to stop shimmering). */
		onpoint?: () => void;
	}

	let { stack, fresh = false, onpoint }: Props = $props();

	const def = $derived(ITEMS[stack.item]);
	let anchor = $state.raw<DOMRect | null>(null);

	function show(event: Event): void {
		anchor = (event.currentTarget as HTMLElement).getBoundingClientRect();
		onpoint?.();
	}
</script>

<button
	type="button"
	class="tip"
	aria-label={def?.name ?? stack.item}
	onpointerenter={show}
	onpointerleave={() => (anchor = null)}
	onfocus={show}
	onblur={() => (anchor = null)}
>
	<Slot
		name={def?.name ?? stack.item}
		image={def?.image}
		count={stack.count}
		rarity={rarityOf(stack.item)}
		quest={def?.quest === true}
		{fresh}
	/>
</button>

{#if anchor}
	<ItemTooltip {stack} {anchor} forSale />
{/if}

<style>
	.tip {
		display: inline-flex;
		padding: 0;
		border: 0;
		border-radius: 12px;
		background: none;
		cursor: default;
	}

	.tip:focus-visible {
		outline: 1px solid var(--accent);
	}
</style>
