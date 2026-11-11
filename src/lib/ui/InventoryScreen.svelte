<script lang="ts">
	import { BACKPACKS, CARRY } from '#lib/content/carry.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { carriedWeight, packBulk, packCapacity } from '#lib/shared/items/inventory.ts';
	import type { InventoryAction, ItemRef } from '#lib/shared/items/types.ts';
	import type { Inventory, ItemStack } from '#lib/shared/player/types.ts';
	import Panel from './Panel.svelte';

	interface Props {
		inventory: Inventory;
		/** Label of the key that selects each quick slot. */
		slotKeys: string[];
		onaction: (action: InventoryAction) => void;
		onclose: () => void;
	}

	let { inventory, slotKeys, onaction, onclose }: Props = $props();

	/** The item the buttons below act on. */
	let chosen = $state<ItemRef | null>(null);

	const weight = $derived(carriedWeight(inventory));
	const bulk = $derived(packBulk(inventory));
	const capacity = $derived(packCapacity(inventory));
	const pockets = $derived(Object.entries(inventory.pockets).filter(([, count]) => count > 0));
	const chosenStack = $derived(stackAt(chosen));
	const chosenBulk = $derived(chosenStack ? (ITEMS[chosenStack.item]?.bulk ?? 0) : 0);

	function stackAt(ref: ItemRef | null): ItemStack | null {
		if (!ref) return null;
		if (ref.area === 'hotbar') return inventory.hotbar[ref.index] ?? null;
		if (ref.area === 'pack') return inventory.pack[ref.index] ?? null;
		const count = inventory.pockets[ref.item] ?? 0;
		return count > 0 ? { item: ref.item, count } : null;
	}

	function isChosen(ref: ItemRef): boolean {
		if (!chosen || chosen.area !== ref.area) return false;
		if (chosen.area === 'pocket') return ref.area === 'pocket' && chosen.item === ref.item;
		return ref.area !== 'pocket' && chosen.index === ref.index;
	}

	function label(stack: ItemStack): string {
		const def = ITEMS[stack.item];
		const name = def?.name ?? stack.item;
		if (def?.firearm) return `${name} (${stack.loaded ?? 0}/${def.firearm.magazine})`;
		return stack.count > 1 ? `${name} × ${stack.count}` : name;
	}

	function kilos(stack: ItemStack): string {
		return `${((ITEMS[stack.item]?.weight ?? 0) * stack.count).toFixed(1)} kg`;
	}

	function act(action: InventoryAction): void {
		onaction(action);
		chosen = null;
	}
</script>

<Panel title="Your pack" {onclose}>
	<div class="meters">
		<div class="meter">
			<span>Weight</span>
			<div class="bar" class:over={weight > CARRY.comfortable}>
				<div class="fill" style:width="{Math.min(100, (weight / CARRY.max) * 100)}%"></div>
				<div class="mark" style:left="{(CARRY.comfortable / CARRY.max) * 100}%"></div>
			</div>
			<span class="value">{weight.toFixed(1)} / {CARRY.max} kg</span>
		</div>
		<div class="meter">
			<span>Pack</span>
			<div class="bar">
				<div class="fill" style:width="{Math.min(100, (bulk / capacity) * 100)}%"></div>
			</div>
			<span class="value">{bulk} / {capacity}</span>
		</div>
	</div>
	{#if weight > CARRY.comfortable}
		<p class="warn">You're carrying enough to slow you down.</p>
	{/if}

	<h3>Quick slots</h3>
	<ul>
		{#each inventory.hotbar as stack, index (index)}
			<li>
				<button
					type="button"
					class="item"
					class:chosen={isChosen({ area: 'hotbar', index })}
					class:held={index === inventory.selected}
					disabled={!stack}
					onclick={() => (chosen = { area: 'hotbar', index })}
				>
					<kbd>{slotKeys[index] ?? index + 1}</kbd>
					<span class="name">{stack ? label(stack) : 'Empty'}</span>
					{#if stack}<span class="weight">{kilos(stack)}</span>{/if}
				</button>
			</li>
		{/each}
	</ul>

	<h3>{BACKPACKS[inventory.backpack]?.name ?? 'Pack'}</h3>
	{#if inventory.pack.length === 0}
		<p class="muted">Empty. What doesn't fit in a quick slot goes in here.</p>
	{:else}
		<ul>
			{#each inventory.pack as stack, index (index)}
				<li>
					<button
						type="button"
						class="item"
						class:chosen={isChosen({ area: 'pack', index })}
						onclick={() => (chosen = { area: 'pack', index })}
					>
						<span class="name">{label(stack)}</span>
						<span class="weight">{kilos(stack)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<h3>Pockets</h3>
	{#if pockets.length === 0}
		<p class="muted">Empty.</p>
	{:else}
		<ul>
			{#each pockets as [item, count] (item)}
				<li>
					<button
						type="button"
						class="item"
						class:chosen={isChosen({ area: 'pocket', item })}
						onclick={() => (chosen = { area: 'pocket', item })}
					>
						<span class="name">{label({ item, count })}</span>
						<span class="weight">{kilos({ item, count })}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if chosen && chosenStack}
		{@const from = chosen}
		<div class="actions" aria-label="Actions for {label(chosenStack)}">
			<span class="what">{label(chosenStack)}</span>
			{#if from.area === 'hotbar'}
				<button
					type="button"
					disabled={bulk + chosenBulk > capacity}
					onclick={() => act({ kind: 'move', from, to: { area: 'pack', index: 0 } })}
				>
					Stow in pack
				</button>
			{:else if from.area === 'pack'}
				{#each inventory.hotbar.keys() as index (index)}
					<button
						type="button"
						onclick={() => act({ kind: 'move', from, to: { area: 'hotbar', index } })}
					>
						To slot {slotKeys[index] ?? index + 1}
					</button>
				{/each}
			{/if}
			<button type="button" onclick={() => act({ kind: 'drop', from, count: 1 })}>
				{chosenStack.count > 1 ? 'Drop one' : 'Drop'}
			</button>
			{#if chosenStack.count > 1}
				<button type="button" onclick={() => act({ kind: 'drop', from, count: chosenStack.count })}>
					Drop all
				</button>
			{/if}
		</div>
	{:else}
		<p class="muted">Choose something to move or drop it.</p>
	{/if}
</Panel>

<style>
	h3 {
		margin: 20px 0 8px;
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

	.meters {
		display: grid;
		gap: 8px;
	}

	.meter {
		display: grid;
		grid-template-columns: 64px 1fr 110px;
		align-items: center;
		gap: 12px;
	}

	.value {
		text-align: right;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.bar {
		position: relative;
		height: 8px;
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
		gap: 12px;
		padding: 8px 10px;
		font: inherit;
		text-align: left;
		color: var(--text);
		background: rgb(255 255 255 / 0.03);
		border: 1px solid var(--border);
		cursor: pointer;
	}

	.item:disabled {
		color: var(--muted);
		cursor: default;
	}

	.item.held {
		border-left: 3px solid var(--text);
	}

	.item.chosen {
		border-color: var(--accent);
		background: rgb(200 155 90 / 0.12);
	}

	.name {
		flex: 1;
	}

	.weight {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	kbd {
		min-width: 1.6em;
		text-align: center;
		color: var(--muted);
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
		color: var(--muted);
		margin: 0;
	}

	ul + .muted {
		margin-top: 20px;
	}

	.warn {
		margin: 10px 0 0;
		color: var(--accent);
	}
</style>
