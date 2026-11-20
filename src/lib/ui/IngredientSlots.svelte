<script lang="ts">
	import { ITEMS, rarityOf } from '#lib/content/items.ts';
	import type { Ingredient } from '#lib/content/recipes.ts';
	import Slot from './Slot.svelte';

	/**
	 * What something takes, as a slot for each kind of thing it needs (docs/dev/crafting.md): the
	 * icon dim with none on hand, the count on hand red with some but not enough, and on hand /
	 * needed under it. One not yet discovered is a ? with no count.
	 */
	interface Props {
		ingredients: Ingredient[];
		/** How many on hand (the stash, or what is carried). */
		have: (item: string) => number;
		/** Whether the explorer has discovered it; left out, everything is known. */
		known?: (item: string) => boolean;
		/** Made this many times over. */
		times?: number;
	}

	let { ingredients, have, known = () => true, times = 1 }: Props = $props();
</script>

<ul class="needs">
	{#each ingredients as i (i.item)}
		{@const def = ITEMS[i.item]}
		{@const need = i.count * times}
		{@const got = have(i.item)}
		{#if known(i.item)}
			<li class:none={got === 0} aria-label="{def?.name ?? i.item}: {got} of {need}">
				<Slot name={def?.name ?? i.item} image={def?.image} rarity={rarityOf(i.item)} />
				<span class="count"><span class:short={got > 0 && got < need}>{got}</span> / {need}</span>
			</li>
		{:else}
			<li class="unknown" aria-label="Not discovered yet">
				<Slot name={null} />
			</li>
		{/if}
	{/each}
</ul>

<style>
	.needs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		--slot-size: 52px;
	}

	li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}

	/* None on hand: the icon dim. */
	li.none :global(.slot) {
		opacity: 0.35;
	}

	.count {
		font-size: 0.78rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.short {
		color: var(--broken);
		font-weight: 600;
	}
</style>
