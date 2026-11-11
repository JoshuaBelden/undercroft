<script lang="ts">
	import { ApiError, changeLoadout } from '#lib/account/account.svelte.ts';
	import { BACKPACKS, CARRY } from '#lib/content/carry.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { carriedWeight, packBulk, packCapacity } from '#lib/shared/items/inventory.ts';
	import type { ItemRef } from '#lib/shared/items/types.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import { stackKilos, stackLabel } from './items.ts';

	interface Props {
		explorer: ExplorerView;
	}

	let { explorer }: Props = $props();

	/** What the buttons act on: a stash entry, or something in the loadout. */
	let chosen = $state<{ stash: number } | { loadout: ItemRef } | null>(null);
	let error = $state('');
	let busy = $state(false);

	const loadout = $derived(explorer.loadout);
	const weight = $derived(carriedWeight(loadout));
	const bulk = $derived(packBulk(loadout));
	const capacity = $derived(packCapacity(loadout));
	const pockets = $derived(Object.entries(loadout.pockets).filter(([, count]) => count > 0));
	const empty = $derived(
		loadout.hotbar.every((slot) => !slot) && loadout.pack.length === 0 && pockets.length === 0
	);

	const chosenStack = $derived.by((): ItemStack | null => {
		if (!chosen) return null;
		if ('stash' in chosen) return explorer.stash[chosen.stash] ?? null;
		const ref = chosen.loadout;
		if (ref.area === 'hotbar') return loadout.hotbar[ref.index] ?? null;
		if (ref.area === 'pack') return loadout.pack[ref.index] ?? null;
		const count = loadout.pockets[ref.item] ?? 0;
		return count > 0 ? { item: ref.item, count } : null;
	});

	function isChosen(ref: ItemRef): boolean {
		if (!chosen || !('loadout' in chosen)) return false;
		const now = chosen.loadout;
		if (now.area !== ref.area) return false;
		if (now.area === 'pocket') return ref.area === 'pocket' && now.item === ref.item;
		return ref.area !== 'pocket' && now.index === ref.index;
	}

	async function move(count: number): Promise<void> {
		if (!chosen || busy) return;
		busy = true;
		error = '';
		try {
			await changeLoadout(
				'stash' in chosen
					? { action: 'take', index: chosen.stash, count }
					: { action: 'stow', from: chosen.loadout, count }
			);
			chosen = null;
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
		}
		busy = false;
	}
</script>

<div class="outfit">
	<div class="columns">
		<section>
			<h3>Stash</h3>
			{#if explorer.stash.length === 0}
				<p class="muted">Nothing yet. What you carry out of the catacombs is kept here.</p>
			{:else}
				<ul>
					{#each explorer.stash as stack, index (index)}
						<li>
							<button
								type="button"
								class="item"
								class:chosen={chosen && 'stash' in chosen && chosen.stash === index}
								onclick={() => (chosen = { stash: index })}
							>
								<span class="name">{stackLabel(stack)}</span>
								<span class="weight">{stackKilos(stack)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section>
			<h3>Going down with you</h3>
			<div class="meter">
				<span>Weight</span>
				<div class="bar" class:over={weight > CARRY.comfortable}>
					<div class="fill" style:width="{Math.min(100, (weight / CARRY.max) * 100)}%"></div>
					<div class="mark" style:left="{(CARRY.comfortable / CARRY.max) * 100}%"></div>
				</div>
				<span class="value">{weight.toFixed(1)} / {CARRY.max} kg</span>
			</div>
			<div class="meter">
				<span>{BACKPACKS[loadout.backpack]?.name ?? 'Pack'}</span>
				<div class="bar">
					<div class="fill" style:width="{Math.min(100, (bulk / capacity) * 100)}%"></div>
				</div>
				<span class="value">{bulk} / {capacity}</span>
			</div>

			{#if empty}
				<p class="muted">Nothing. You'd go down with your headlamp and your hands.</p>
			{:else}
				<ul>
					{#each loadout.hotbar as stack, index (index)}
						{#if stack}
							<li>
								<button
									type="button"
									class="item"
									class:chosen={isChosen({ area: 'hotbar', index })}
									onclick={() => (chosen = { loadout: { area: 'hotbar', index } })}
								>
									<kbd>{index + 1}</kbd>
									<span class="name">{stackLabel(stack)}</span>
									<span class="weight">{stackKilos(stack)}</span>
								</button>
							</li>
						{/if}
					{/each}
					{#each loadout.pack as stack, index (index)}
						<li>
							<button
								type="button"
								class="item"
								class:chosen={isChosen({ area: 'pack', index })}
								onclick={() => (chosen = { loadout: { area: 'pack', index } })}
							>
								<kbd>pack</kbd>
								<span class="name">{stackLabel(stack)}</span>
								<span class="weight">{stackKilos(stack)}</span>
							</button>
						</li>
					{/each}
					{#each pockets as [item, count] (item)}
						<li>
							<button
								type="button"
								class="item"
								class:chosen={isChosen({ area: 'pocket', item })}
								onclick={() => (chosen = { loadout: { area: 'pocket', item } })}
							>
								<kbd>pocket</kbd>
								<span class="name">{stackLabel({ item, count })}</span>
								<span class="weight">{stackKilos({ item, count })}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	{#if explorer.underground}
		<p class="muted">You're underground: nothing can be changed until you're back.</p>
	{:else if chosen && chosenStack}
		{@const taking = 'stash' in chosen}
		<div class="actions">
			<span class="what">{stackLabel(chosenStack)}</span>
			<button type="button" disabled={busy} onclick={() => void move(1)}>
				{taking ? 'Take' : 'Leave behind'}{chosenStack.count > 1 ? ' one' : ''}
			</button>
			{#if chosenStack.count > 1}
				<button type="button" disabled={busy} onclick={() => void move(chosenStack.count)}>
					{taking ? 'Take all' : 'Leave all behind'}
				</button>
			{/if}
		</div>
	{:else}
		<p class="muted">
			Choose something to take it with you or leave it in the stash. What you take down and don't
			bring back is gone.
		</p>
	{/if}
</div>

<style>
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

	.meter {
		display: grid;
		grid-template-columns: 1fr;
		gap: 4px;
		margin-bottom: 10px;
		font-size: 0.85rem;
	}

	.value {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.bar {
		position: relative;
		height: 6px;
		background: rgb(255 255 255 / 0.08);
	}

	.fill {
		height: 100%;
		background: var(--text);
	}

	.bar.over .fill {
		background: var(--accent);
	}

	.mark {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 1px;
		background: var(--muted);
	}

	.item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		font: inherit;
		text-align: left;
		color: var(--text);
		background: rgb(255 255 255 / 0.03);
		border: 1px solid var(--border);
		cursor: pointer;
	}

	.item.chosen {
		border-color: var(--accent);
		background: rgb(0 129 157 / 0.18);
	}

	.name {
		flex: 1;
	}

	.weight,
	kbd {
		color: var(--muted);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	.what {
		flex-basis: 100%;
	}

	.muted {
		margin: 0;
		color: var(--muted);
	}

	.columns + .muted,
	.columns + .error {
		margin-top: 20px;
	}

	.error + .muted {
		margin-top: 12px;
	}

	.error {
		margin: 0;
		color: #ff9a70;
	}
</style>
