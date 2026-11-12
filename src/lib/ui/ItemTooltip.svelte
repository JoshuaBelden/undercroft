<script lang="ts">
	import { imageUrl } from '#lib/content/images.ts';
	import { ITEMS, RARITIES, rarityOf } from '#lib/content/items.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import { categoryLabel, COIN_SIGN, itemStats } from './items.ts';

	/**
	 * What an item is, shown beside the slot it sits in: its picture, name, a line about it and
	 * the figures that matter. Give it the stack and where the slot is on the screen; it goes to
	 * the right of the slot, or to the left when there is no room there.
	 */
	interface Props {
		stack: ItemStack;
		/** The slot's place on the screen (`getBoundingClientRect`). */
		anchor: DOMRect;
	}

	let { stack, anchor }: Props = $props();

	const GAP = 10;
	const WIDTH = 280;

	let height = $state(0);

	const def = $derived(ITEMS[stack.item]);
	const stats = $derived(itemStats(stack));
	const rarity = $derived(rarityOf(stack.item));
	const rarityName = $derived(RARITIES.find((r) => r.id === rarity)?.name ?? '');
	const left = $derived(
		anchor.right + GAP + WIDTH > window.innerWidth
			? Math.max(GAP, anchor.left - GAP - WIDTH)
			: anchor.right + GAP
	);
	// Level with the slot, pulled up where it would run off the bottom of the window.
	const top = $derived(Math.max(GAP, Math.min(anchor.top, window.innerHeight - height - GAP)));
</script>

<div
	class="tooltip"
	role="tooltip"
	style:left="{left}px"
	style:top="{top}px"
	style:width="{WIDTH}px"
	bind:clientHeight={height}
>
	<div class="head">
		<div class="picture">
			{#if def?.image}
				<img src={imageUrl(def.image)} alt="" />
			{:else}
				<span aria-hidden="true">{(def?.name ?? stack.item).charAt(0)}</span>
			{/if}
		</div>
		<div>
			<p class="name">{def?.name ?? stack.item}</p>
			{#if def}
				{#if def.quest}
					<p class="rarity quest">Unique</p>
				{:else}
					<p class="rarity {rarity}">{rarityName}</p>
				{/if}
				<p class="category">{categoryLabel(def.id)}</p>
			{/if}
		</div>
	</div>
	{#if def?.flavor}
		<p class="flavor">{def.flavor}</p>
	{/if}
	<dl>
		{#each stats as stat (stat.label + stat.value)}
			<dt>{stat.label}</dt>
			<dd>
				{#if stat.coins}<span class="sign" aria-hidden="true">{COIN_SIGN}</span>{/if}{stat.value}
			</dd>
		{/each}
	</dl>
</div>

<style>
	.tooltip {
		position: fixed;
		z-index: 40;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--panel);
		color: var(--text);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.6);
		pointer-events: none;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.picture {
		flex: none;
		width: 64px;
		height: 64px;
		display: grid;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: rgb(255 255 255 / 0.05);
		overflow: hidden;
	}

	.picture img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.picture span {
		font-family: var(--font-lore);
		font-size: 1.8rem;
		color: var(--muted);
	}

	p {
		margin: 0;
	}

	.name {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.rarity {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: var(--muted);
	}

	.rarity.uncommon {
		color: var(--rarity-uncommon);
	}

	.rarity.rare {
		color: var(--rarity-rare);
	}

	.rarity.epic {
		color: var(--rarity-epic);
	}

	.rarity.legendary {
		color: var(--rarity-legendary);
	}

	.rarity.quest {
		color: var(--quest);
	}

	.category {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.flavor {
		margin-top: 12px;
		font-style: italic;
		line-height: 1.4;
		color: var(--muted);
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 14px;
		margin: 12px 0 0;
		padding-top: 10px;
		border-top: 1px solid var(--border);
		font-family: var(--font-ui);
		font-size: 0.85rem;
	}

	dt {
		color: var(--muted);
	}

	dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	/* The full-width coin sign carries its own space: pull the value in, as in the top bar. */
	.sign {
		margin-right: -0.12em;
	}
</style>
