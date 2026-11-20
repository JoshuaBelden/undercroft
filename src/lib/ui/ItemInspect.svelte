<script lang="ts">
	import { imageUrl } from '#lib/content/images.ts';
	import { ITEMS, RARITIES, rarityOf } from '#lib/content/items.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import Dialog from './Dialog.svelte';
	import { categoryLabel, COIN_SIGN, itemStats, stackCondition } from './items.ts';

	/**
	 * The Inspect panel (an item's right-click menu, Inspect): everything about one stack. Its
	 * picture, name, rarity, type and flavor, its durability, and every figure that applies to it
	 * (`itemStats`: damage, spread, time between shots, reload, range, noise, wear per use, weight,
	 * what it sells for). The tooltip shows only the first few of these. See docs/dev/items.md.
	 */
	interface Props {
		stack: ItemStack;
		onclose: () => void;
	}

	let { stack, onclose }: Props = $props();

	const def = $derived(ITEMS[stack.item]);
	const name = $derived(def?.name ?? stack.item);
	const rarity = $derived(rarityOf(stack.item));
	const rarityName = $derived(RARITIES.find((r) => r.id === rarity)?.name ?? '');
	const wear = $derived(stackCondition(stack));
	const stats = $derived(itemStats(stack));
</script>

<Dialog title="Inspect" {onclose}>
	<div class="head">
		<div class="picture">
			{#if def?.image}
				<img src={imageUrl(def.image)} alt="" />
			{:else}
				<span aria-hidden="true">{name.charAt(0)}</span>
			{/if}
		</div>
		<div>
			<p class="name">{name}{stack.count > 1 ? ` × ${stack.count}` : ''}</p>
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
	{#if wear}
		<div class="durability" class:broken={wear.broken}>
			<span class="label"
				>{wear.broken ? 'Broken: it does nothing until repaired' : 'Durability'}</span
			>
			<span class="percent">{wear.percent}%</span>
			<span class="bar" aria-hidden="true"><span style:width="{wear.left * 100}%"></span></span>
		</div>
	{/if}
	<dl>
		{#each stats as stat (stat.label + stat.value)}
			<dt>{stat.label}</dt>
			<dd>
				{#if stat.coins}<span class="sign" aria-hidden="true">{COIN_SIGN}</span>{/if}{stat.value}
			</dd>
		{/each}
	</dl>
	{#snippet footer()}
		<button type="button" class="primary" onclick={onclose}>Close</button>
	{/snippet}
</Dialog>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: min(360px, 80vw);
	}

	.picture {
		flex: none;
		width: 88px;
		height: 88px;
		display: grid;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 12px;
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
		font-size: 2.2rem;
		color: var(--muted);
	}

	p {
		margin: 0;
	}

	.name {
		font-family: var(--font-display);
		font-size: 1.4rem;
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
		margin-top: 14px;
		max-width: 46ch;
		font-style: italic;
		line-height: 1.4;
		color: var(--muted);
	}

	.durability {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px;
		margin-top: 14px;
		font-family: var(--font-ui);
		font-size: 0.9rem;
	}

	.durability .label {
		color: var(--muted);
	}

	.durability .percent {
		font-variant-numeric: tabular-nums;
	}

	.bar {
		grid-column: 1 / -1;
		height: 5px;
		border-radius: 3px;
		background: rgb(255 255 255 / 0.1);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--text);
	}

	.durability.broken .label,
	.durability.broken .percent {
		color: var(--broken);
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 18px;
		margin: 14px 0 0;
		padding-top: 12px;
		border-top: 1px solid var(--border);
		font-family: var(--font-ui);
		font-size: 0.9rem;
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
