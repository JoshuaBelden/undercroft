<script lang="ts">
	import { fly } from 'svelte/transition';
	import { ApiError, trade } from '#lib/account/account.svelte.ts';
	import { SHOP, money, type ShopEntry } from '#lib/content/economy.ts';
	import { ITEMS, SLOTS } from '#lib/content/items.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import ItemFilters from './ItemFilters.svelte';
	import { CATEGORY_LABELS, itemStats, matchesFilter, type ItemFilter } from './items.ts';
	import Slot from './Slot.svelte';

	/**
	 * The Store page: what is for sale, as slots in a panel like the stash, with the same filters.
	 * Clicking one slides its details in from the right, where you say how many and purchase.
	 * Selling is done from the Loadout page. See docs/dev/economy.md.
	 */
	interface Props {
		explorer: ExplorerView;
		/** Ready to descend with the party: nothing can be bought until they cancel. */
		ready?: boolean;
		/** Something was bought (for a sound). */
		onbuy?: () => void;
	}

	let { explorer, ready = false, onbuy }: Props = $props();

	/** The most lots the server sells at once. */
	const MAX_LOTS = 99;

	let filter = $state<ItemFilter>('all');
	/** The item whose details are open. */
	let selected = $state<string | null>(null);
	/** What the quantity field holds: anything can be typed, so `lots` is what is used. */
	let quantity = $state<number | null>(1);
	let error = $state('');
	let busy = $state(false);

	const shown = $derived(SHOP.filter((entry) => matchesFilter(entry.item, filter)));
	const entry = $derived(SHOP.find((e) => e.item === selected) ?? null);
	const def = $derived(entry ? ITEMS[entry.item] : undefined);
	const lots = $derived(Math.min(MAX_LOTS, Math.max(1, Math.floor(quantity ?? 1))));
	const total = $derived(entry ? entry.price * lots : 0);

	/** Open an item's details; clicking the one that is open closes them. */
	function select(item: string): void {
		selected = selected === item ? null : item;
		quantity = 1;
		error = '';
	}

	function close(): void {
		selected = null;
		error = '';
	}

	async function purchase(bought: ShopEntry): Promise<void> {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await trade({ action: 'buy', item: bought.item, lots });
			onbuy?.();
			close();
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
		}
		busy = false;
	}

	// Escape closes the details. Caught before the dashboard hears it, which would open Settings.
	$effect(() => {
		if (!selected) return;
		const onKey = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			event.stopPropagation();
			close();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});
</script>

<div class="store">
	<section class="panel" aria-labelledby="store-title">
		<h2 id="store-title">Store</h2>
		<div class="body">
			<ItemFilters bind:filter />
			<div class="scroll">
				<div class="grid" style:--columns={SLOTS.stashColumns}>
					{#each shown as ware (ware.item)}
						{@const item = ITEMS[ware.item]}
						<button
							type="button"
							class="ware"
							aria-label="{item?.name ?? ware.item}{ware.lot > 1 ? ` × ${ware.lot}` : ''}, {money(
								ware.price
							)}"
							aria-pressed={selected === ware.item}
							onclick={() => select(ware.item)}
						>
							<Slot
								name={item?.name ?? ware.item}
								count={ware.lot}
								image={item?.image}
								detail={String(ware.price)}
							/>
						</button>
					{:else}
						<p class="none">Nothing of that kind is for sale.</p>
					{/each}
				</div>
			</div>
		</div>
		{#if explorer.underground}
			<p class="note">You're underground: the store is closed to you until you're back.</p>
		{:else if ready}
			<p class="note">You're ready to descend: the store is closed to you unless you cancel.</p>
		{/if}
	</section>
</div>

{#if entry}
	<aside class="details" aria-labelledby="details-title" transition:fly={{ x: 420, duration: 220 }}>
		<header>
			<div class="picture">
				{#if def?.image}
					<img src="/assets/images/{def.image}.webp" alt="" />
				{:else}
					<span aria-hidden="true">{(def?.name ?? entry.item).charAt(0)}</span>
				{/if}
			</div>
			<div class="title">
				<h3 id="details-title">{def?.name ?? entry.item}</h3>
				{#if def}
					<p class="category">{CATEGORY_LABELS[def.category]}</p>
				{/if}
			</div>
			<button type="button" class="close" aria-label="Close" title="Close" onclick={close}>
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<path
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						d="M6 6l12 12M18 6L6 18"
					/>
				</svg>
			</button>
		</header>

		<div class="about">
			{#if def?.flavor}
				<p class="flavor">{def.flavor}</p>
			{/if}
			<dl>
				<dt>Price</dt>
				<dd>{money(entry.price)}{entry.lot > 1 ? ` for ${entry.lot}` : ''}</dd>
				{#each itemStats({ item: entry.item, count: entry.lot }, true) as stat (stat.label + stat.value)}
					<dt>{stat.label}</dt>
					<dd>{stat.value}</dd>
				{/each}
			</dl>
			<p class="small">
				What you buy goes to your stash, if there is room for it.
				{#if def?.firearm}It comes empty: buy rounds too.{/if}
			</p>
		</div>

		<footer>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			<p class="sum">
				<span>
					Total{entry.lot > 1 ? ` (${entry.lot * lots})` : ''}
				</span>
				<strong class:short={explorer.money < total}>{money(total)}</strong>
			</p>
			<p class="purse">You have {money(explorer.money)}</p>
			<div class="buy">
				<div class="quantity">
					<button
						type="button"
						aria-label="One fewer"
						disabled={lots <= 1}
						onclick={() => (quantity = lots - 1)}
					>
						−
					</button>
					<input
						type="number"
						min="1"
						max={MAX_LOTS}
						step="1"
						aria-label="Quantity"
						bind:value={quantity}
						onblur={() => (quantity = lots)}
					/>
					<button
						type="button"
						aria-label="One more"
						disabled={lots >= MAX_LOTS}
						onclick={() => (quantity = lots + 1)}
					>
						+
					</button>
				</div>
				<button
					type="button"
					class="purchase"
					disabled={busy || explorer.underground || ready || explorer.money < total}
					onclick={() => void purchase(entry)}
				>
					Purchase
				</button>
			</div>
		</footer>
	</aside>
{/if}

<style>
	.store {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: flex-start;
		/* Slots get smaller in a window too narrow for five of them and the filters. */
		--slot-size: clamp(40px, calc((100vw - 150px) / 5), 92px);
		/* Under the bar, and clear of the corner buttons at the bottom. */
		padding: 24px 0 84px;
	}

	/* The same container as the stash: rounded, and see-through enough for the picture behind. */
	.panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		/* The window, less the bar above and the padding around. */
		max-height: calc(100vh - 170px);
		padding: 18px 20px 20px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.55);
		backdrop-filter: blur(6px);
	}

	h2 {
		margin: 0 0 14px;
		font-size: 1.1rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.body {
		display: flex;
		gap: 14px;
		min-height: 0;
	}

	.scroll {
		min-height: 0;
		overflow-y: auto;
		padding-right: 6px;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	/* Always as wide as a full row, so the panel keeps its width whatever the filter shows. */
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), var(--slot-size));
		gap: 8px;
	}

	.none {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--muted);
	}

	/* A slot you can click: lit under the cursor like the stash's, ringed while its details are open. */
	.ware {
		display: flex;
		padding: 0;
		border: 0;
		border-radius: 12px;
		background: none;
		color: inherit;
	}

	.ware:hover :global(.slot),
	.ware:focus-visible :global(.slot) {
		border-color: var(--text);
		background: rgb(255 255 255 / 0.09);
	}

	.ware:focus-visible {
		outline: none;
	}

	.ware[aria-pressed='true'] :global(.slot) {
		border-color: var(--accent);
		background: rgb(0 129 157 / 0.2);
		box-shadow: 0 0 0 1px var(--accent);
	}

	.note {
		margin: 16px 0 0;
		color: var(--muted);
	}

	/*
	 * The details: down the right edge of the window, from under the dashboard's bar. Light, with dark text, like
	 * the part of a dialog you read.
	 */
	.details {
		position: fixed;
		top: var(--hub-bar, 0px);
		right: 0;
		bottom: 0;
		z-index: 30;
		width: min(400px, 100vw);
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--border);
		background: rgb(226 220 204 / 0.94);
		color: #14110f;
		box-shadow: -12px 0 40px rgb(0 0 0 / 0.55);
		backdrop-filter: blur(6px);
		--rule: rgb(20 17 15 / 0.22);
		--soft: rgb(20 17 15 / 0.66);
	}

	header {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 20px;
		border-bottom: 1px solid var(--rule);
	}

	.picture {
		flex: none;
		width: 84px;
		height: 84px;
		display: grid;
		place-items: center;
		border-radius: 12px;
		background: #14110f;
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

	.title {
		flex: 1;
		min-width: 0;
	}

	h3 {
		margin: 0;
		font-size: 1.5rem;
		letter-spacing: 0.04em;
		line-height: 1.15;
	}

	p {
		margin: 0;
	}

	.category {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #005a6e;
	}

	.close {
		align-self: flex-start;
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		padding: 0;
		border-color: transparent;
		border-radius: 50%;
		color: inherit;
	}

	.close:hover,
	.close:focus-visible {
		border-color: #14110f;
	}

	.about {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 20px;
		scrollbar-width: thin;
		scrollbar-color: var(--rule) transparent;
	}

	.flavor {
		margin-bottom: 16px;
		font-style: italic;
		line-height: 1.45;
		color: var(--soft);
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		margin: 0 0 16px;
		padding: 12px 0;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		font-family: var(--font-ui);
		font-size: 0.9rem;
	}

	dt {
		color: var(--soft);
	}

	dd {
		margin: 0;
		text-align: right;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.small {
		font-size: 0.9rem;
		line-height: 1.4;
		color: var(--soft);
	}

	/* A shade darker than what is above it. */
	footer {
		padding: 16px 20px 20px;
		border-top: 1px solid var(--rule);
		background: rgb(20 17 15 / 0.1);
	}

	.error {
		margin-bottom: 10px;
		font-weight: 600;
		color: #9c2f10;
	}

	.sum {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		font-family: var(--font-ui);
	}

	.sum strong {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-variant-numeric: tabular-nums;
	}

	/* More than you have. */
	.sum strong.short {
		color: #9c2f10;
	}

	.purse {
		margin-bottom: 14px;
		text-align: right;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--soft);
	}

	.buy {
		display: flex;
		gap: 12px;
	}

	/* One pill: fewer, how many, more. */
	.quantity {
		flex: none;
		display: flex;
		align-items: stretch;
		border: 1px solid #14110f;
		border-radius: 999px;
		overflow: hidden;
	}

	.quantity button {
		width: 38px;
		padding: 0;
		border: 0;
		color: inherit;
		font-size: 1.2rem;
		font-weight: 600;
		line-height: 1;
	}

	.quantity button:hover:not(:disabled),
	.quantity button:focus-visible {
		background: rgb(20 17 15 / 0.14);
	}

	.quantity input {
		width: 3.2em;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 600;
		text-align: center;
		font-variant-numeric: tabular-nums;
		/* The buttons beside it do the stepping. */
		appearance: textfield;
	}

	.quantity input::-webkit-inner-spin-button,
	.quantity input::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}

	.purchase {
		flex: 1;
		padding: 10px 20px;
		border-color: var(--accent);
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.purchase:hover:not(:disabled),
	.purchase:focus-visible {
		border-color: #14110f;
	}

	button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	/* A phone: the page's own small padding. */
	@media (max-width: 720px) {
		.store {
			padding: 16px 16px 84px;
		}

		.panel {
			max-height: none;
		}
	}
</style>
