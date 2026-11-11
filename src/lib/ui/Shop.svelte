<script lang="ts">
	import { ApiError, trade } from '#lib/account/account.svelte.ts';
	import { SHOP, money, sellPrice } from '#lib/content/economy.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { stackLabel } from './items.ts';

	interface Props {
		explorer: ExplorerView;
		/** Something was bought or sold (for a sound). */
		ontrade?: (kind: 'buy' | 'sell') => void;
	}

	let { explorer, ontrade }: Props = $props();

	let error = $state('');
	let busy = $state(false);

	async function run(
		change:
			| { action: 'buy'; item: string; lots: number }
			| { action: 'sell'; index: number; count: number }
	): Promise<void> {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await trade(change);
			ontrade?.(change.action);
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
		}
		busy = false;
	}
</script>

<div class="shop">
	<p class="purse">You have <strong>{money(explorer.money)}</strong>.</p>

	{#if explorer.underground}
		<p class="muted">You're underground: the store is closed to you until you're back.</p>
	{/if}
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<div class="columns">
		<section>
			<h3>For sale</h3>
			<ul>
				{#each SHOP as entry (entry.item)}
					<li>
						<span class="name">
							{ITEMS[entry.item]?.name ?? entry.item}{entry.lot > 1 ? ` × ${entry.lot}` : ''}
						</span>
						<span class="price">{money(entry.price)}</span>
						<button
							type="button"
							disabled={busy || explorer.underground || explorer.money < entry.price}
							onclick={() => void run({ action: 'buy', item: entry.item, lots: 1 })}
						>
							Buy
						</button>
					</li>
				{/each}
			</ul>
			<p class="muted">What you buy goes to your stash. Firearms come empty.</p>
		</section>

		<section>
			<h3>Your stash</h3>
			{#if explorer.stash.length === 0}
				<p class="muted">Nothing to sell. Bring something back.</p>
			{:else}
				<ul>
					{#each explorer.stash as stack, index (index)}
						{@const each = sellPrice(stack.item)}
						<li>
							<span class="name">{stackLabel(stack)}</span>
							{#if each > 0}
								<span class="price">{money(each)}{stack.count > 1 ? ' each' : ''}</span>
								<button
									type="button"
									disabled={busy || explorer.underground}
									onclick={() => void run({ action: 'sell', index, count: 1 })}
								>
									Sell
								</button>
								{#if stack.count > 1}
									<button
										type="button"
										disabled={busy || explorer.underground}
										onclick={() => void run({ action: 'sell', index, count: stack.count })}
									>
										All
									</button>
								{/if}
							{:else}
								<span class="price">No one wants it</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>

<style>
	.purse {
		margin: 0 0 16px;
	}

	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}

	@media (max-width: 560px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}

	h3 {
		margin: 0 0 8px;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}

	li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: rgb(255 255 255 / 0.03);
		border: 1px solid var(--border);
	}

	.name {
		flex: 1;
	}

	.price {
		color: var(--muted);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.muted {
		margin: 10px 0 0;
		color: var(--muted);
	}

	.error {
		margin: 0 0 12px;
		color: #ff9a70;
	}
</style>
