<script lang="ts" module>
	import { ItemBoard } from './itemBoard.svelte.ts';
	import type { SlotRef } from '#lib/shared/items/types.ts';
	import type { ItemFilter } from './items.ts';

	/**
	 * The catalogue's board: anything carried can be dropped on any catalogue slot (it is thrown
	 * away), whatever item that slot shows.
	 */
	class CatalogueBoard extends ItemBoard {
		override allows(ref: SlotRef): boolean {
			if (ref.area !== 'stash') return super.allows(ref);
			return !!this.dragging && this.dragging.ref.area !== 'stash' && !this.locked;
		}
	}

	/** How many go with each give, remembered while the game is open. */
	let lastAmount: 'one' | 'five' | 'stack' = 'one';
	let lastFilter: ItemFilter = 'all';
</script>

<script lang="ts">
	import { BACKPACKS } from '#lib/content/carry.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import { maxStack, newStack } from '#lib/shared/items/inventory.ts';
	import type { InventoryAction } from '#lib/shared/items/types.ts';
	import type { Inventory } from '#lib/shared/player/types.ts';
	import type { AdminCommand } from '#lib/shared/protocol.ts';
	import CarriedWeight from './CarriedWeight.svelte';
	import ItemFilters from './ItemFilters.svelte';
	import ItemOverlays from './ItemOverlays.svelte';
	import ItemSlot from './ItemSlot.svelte';
	import LoadoutPanel from './LoadoutPanel.svelte';
	import { matchesFilter } from './items.ts';

	/**
	 * The admin item catalogue (dev mode, from the admin screen's Items group): every item beside
	 * what you carry, like a crate that never runs out. Drag an item onto the slot it should go in,
	 * or shift-click it to send it where it belongs. Drag something you carry back onto the
	 * catalogue, or drop it, and it is gone for good. The server says what didn't fit.
	 */
	interface Props {
		inventory: Inventory;
		onadmin: (command: AdminCommand) => void;
		/** Moves within what you carry go the usual way. */
		onaction: (action: InventoryAction) => void;
		onclose: () => void;
	}

	let { inventory, onadmin, onaction, onclose }: Props = $props();

	// Clues are read where they lie; they can't be given.
	const ALL = Object.keys(ITEMS)
		.filter((id) => ITEMS[id].kind !== 'clue' && ITEMS[id].maxStack >= 1)
		.sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name));

	let filter = $state<ItemFilter>(lastFilter);
	let amount = $state(lastAmount);
	let search = $state('');
	$effect(() => {
		lastFilter = filter;
		lastAmount = amount;
	});

	const shown = $derived(
		ALL.filter(
			(id) =>
				matchesFilter(id, filter) &&
				ITEMS[id].name.toLowerCase().includes(search.trim().toLowerCase())
		)
	);

	/** How many of an item one give is. */
	function countOf(item: string): number {
		if (amount === 'stack') return maxStack(item);
		return Math.min(amount === 'five' ? 5 : 1, maxStack(item));
	}

	const stacks = $derived(
		shown.map((id) => newStack(id, countOf(id), ITEMS[id].firearm?.magazine))
	);

	function give(from: SlotRef, to?: SlotRef): void {
		if (from.area !== 'stash') return;
		const stack = stacks[from.index];
		if (stack) onadmin({ kind: 'give', item: stack.item, count: stack.count, to });
	}

	const board = new CatalogueBoard({
		belongings: () => ({ inventory, stash: stacks }),
		act: (action) => {
			const from = action.from;
			if (from.area === 'stash') {
				// Out of the catalogue: given, onto the slot it was dropped on or where it belongs.
				if (action.kind === 'move') give(from, action.to);
				else if (action.kind === 'quick' || action.kind === 'equip') give(from);
				return;
			}
			// Back onto the catalogue, or dropped: thrown away, not left on the floor.
			if ((action.kind === 'move' && action.to.area === 'stash') || action.kind === 'drop') {
				onadmin({ kind: 'discard', from });
				return;
			}
			onaction(action);
		}
	});

	const AMOUNTS = [
		{ id: 'one', label: '1' },
		{ id: 'five', label: '5' },
		{ id: 'stack', label: 'Stack' }
	] as const;
</script>

<div class="backdrop">
	<section class="panel" aria-labelledby="catalogue-title" {@attach menu({ back: onclose })}>
		<header>
			<h2 id="catalogue-title">Item catalogue</h2>
			<p class="hint">
				Drag an item onto a slot, or shift-click it to send it where it belongs. Drag what you carry
				back here, or drop it, to throw it away.
			</p>
			<button type="button" onclick={onclose}>Back</button>
		</header>

		<div class="body">
			<ItemFilters bind:filter />
			<section class="catalogue">
				<div class="tools">
					<input
						type="search"
						placeholder="Find an item"
						aria-label="Find an item"
						autocomplete="off"
						bind:value={search}
					/>
					<div class="amounts" role="group" aria-label="How many each time">
						{#each AMOUNTS as option (option.id)}
							<button
								type="button"
								aria-pressed={amount === option.id}
								onclick={() => (amount = option.id)}>{option.label}</button
							>
						{/each}
					</div>
				</div>
				<div class="grid">
					{#each stacks as stack, index (stack.item)}
						<ItemSlot
							{board}
							ref={{ area: 'stash', index }}
							{stack}
							label="Catalogue: {ITEMS[stack.item].name}"
						/>
					{:else}
						<p class="none">No item by that name.</p>
					{/each}
				</div>
			</section>

			<section class="pack">
				<div class="pack-title">
					<h3>{BACKPACKS[inventory.pack]?.name ?? 'Your pack'}</h3>
					<CarriedWeight {inventory} />
					<button type="button" class="empty" onclick={() => onadmin({ kind: 'emptyInventory' })}>
						Empty everything
					</button>
				</div>
				<LoadoutPanel {inventory} {board} showHand />
			</section>
		</div>
	</section>
</div>

<ItemOverlays {board} />

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgb(0 0 0 / 0.5);
		z-index: 20;
	}

	.panel {
		box-sizing: border-box;
		width: min(1600px, 94vw);
		max-height: calc(100vh - 32px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 22px 28px 28px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.9);
	}

	header {
		display: flex;
		align-items: center;
		gap: 20px;
		margin-bottom: 18px;
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.hint {
		margin: 0 auto 0 0;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		color: var(--muted);
	}

	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 24px;
	}

	.catalogue {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.tools {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	input {
		flex: 1;
		max-width: 320px;
	}

	.amounts {
		display: flex;
		gap: 6px;
	}

	.amounts button[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--text);
	}

	/* The catalogue scrolls; what you carry stays in view beside it. */
	.grid {
		--slot-size: 72px;
		display: grid;
		grid-template-columns: repeat(auto-fill, var(--slot-size));
		gap: 8px;
		align-content: start;
		overflow-y: auto;
		padding-right: 6px;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.none {
		margin: 0;
		color: var(--muted);
	}

	.pack {
		overflow-y: auto;
	}

	h3 {
		margin: 0 0 10px;
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.pack-title {
		display: flex;
		align-items: baseline;
		gap: 16px;
	}

	.empty {
		margin-left: auto;
	}
</style>
