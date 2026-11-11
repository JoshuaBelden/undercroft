<script lang="ts">
	import { ApiError, api, loadAccount, session } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import { ITEMS, SLOTS, type ItemCategory } from '#lib/content/items.ts';
	import type { AccountView, ExplorerView } from '#lib/shared/account/types.ts';
	import { applyAction } from '#lib/shared/items/inventory.ts';
	import type { InventoryAction, SlotRef } from '#lib/shared/items/types.ts';
	import CarriedWeight from './CarriedWeight.svelte';
	import { ItemBoard } from './itemBoard.svelte.ts';
	import ItemOverlays from './ItemOverlays.svelte';
	import ItemSlot from './ItemSlot.svelte';
	import LoadoutPanel from './LoadoutPanel.svelte';

	/**
	 * The Loadout page: the STASH (what is kept on the surface) beside the LOADOUT (what goes down
	 * next). Things are dragged between slots; shift-click sends one across; the alternate menu
	 * equips, splits, sells and drops.
	 *
	 * A change shows at once: it is worked out here with the same rules the server uses, then sent,
	 * and what the server says is what stays. See docs/dev/economy.md.
	 */
	interface Props {
		explorer: ExplorerView;
		/** Something was moved, sold or dropped (for a sound). */
		onchange?: (kind: 'move' | 'sell' | 'drop') => void;
	}

	let { explorer, onchange }: Props = $props();

	type Filter = 'all' | ItemCategory;

	/** The stash filters, top to bottom. Each icon is drawn in a 24-unit box. */
	const FILTERS: { id: Filter; label: string; icon: string }[] = [
		{ id: 'all', label: 'All items', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
		{
			id: 'weapon',
			label: 'Weapons',
			icon: 'M19.5 3 21 4.5 10 15.5 8.5 14zM8 13l3 3-1.5 1.5-1-1L5 20l-1-1 3.500-3.500-1-1z'
		},
		{
			id: 'defense',
			label: 'Defense',
			icon: 'M12 3l7 2.500v6c0 4.500-3 7.800-7 9.500-4-1.700-7-5-7-9.500v-6z'
		},
		{ id: 'quick', label: 'Quick use', icon: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z' },
		{
			id: 'other',
			label: 'Other',
			icon: 'M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z'
		}
	];

	let filter = $state<Filter>('all');
	let error = $state('');

	/**
	 * The stash slots to show, each with its real place in the stash. A filter shows the stacks of
	 * that kind first and then the empty slots, so there is still somewhere to drop things.
	 */
	const shown = $derived.by(() => {
		const slots = explorer.stash.map((stack, index) => ({ stack, index }));
		if (filter === 'all') return slots;
		return [
			...slots.filter(({ stack }) => stack && ITEMS[stack.item]?.category === filter),
			...slots.filter(({ stack }) => !stack)
		];
	});

	/** Requests not yet answered; they are sent one at a time, in order. */
	let waiting = 0;
	let queue: Promise<void> = Promise.resolve();

	/** Send a change after those before it. What the server says is shown once nothing is waiting. */
	function send(path: string, body: unknown): void {
		waiting++;
		queue = queue
			.then(() => api<AccountView>(path, 'POST', body))
			.then(
				(view) => {
					waiting--;
					if (waiting === 0) session.account = view;
				},
				(caught: unknown) => {
					waiting--;
					error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
					// What was shown may not be what happened: ask how things stand.
					if (waiting === 0) void loadAccount();
				}
			);
	}

	/** Move, equip, split or drop: done here first so it shows at once, then sent to the server. */
	function arrange(action: InventoryAction): void {
		const account = session.account;
		if (!account) return;
		const stash = $state.snapshot(explorer.stash);
		const inventory = $state.snapshot(explorer.loadout);
		const { result } = applyAction({ inventory, stash }, action);
		if (result !== 'ok') {
			error =
				result === 'heavy'
					? 'That is more than you can carry'
					: "That doesn't go there, or there is no room for it";
			return;
		}
		error = '';
		account.explorer.stash = stash;
		account.explorer.loadout = inventory;
		onchange?.(action.kind === 'drop' ? 'drop' : 'move');
		send('/api/explorer/loadout', action);
	}

	/** Selling changes the purse, which is the server's to say: it shows when the answer comes. */
	function sell(from: SlotRef, count: number): void {
		error = '';
		onchange?.('sell');
		send('/api/shop', { action: 'sell', from, count });
	}

	const board = new ItemBoard({
		belongings: () => ({ inventory: explorer.loadout, stash: explorer.stash }),
		act: arrange,
		sell,
		locked: () => explorer.underground,
		price: money,
		confirmDrop: true
	});
</script>

<div class="outfit">
	<section class="panel stash" aria-labelledby="stash-title">
		<h2 id="stash-title">Stash</h2>
		<div class="stash-body">
			<div class="filters" role="group" aria-label="Show">
				{#each FILTERS as entry (entry.id)}
					<button
						type="button"
						class="filter"
						aria-label={entry.label}
						aria-pressed={filter === entry.id}
						title={entry.label}
						onclick={() => (filter = entry.id)}
					>
						<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
							<path fill="currentColor" d={entry.icon} />
						</svg>
					</button>
				{/each}
			</div>
			<div class="scroll">
				<div class="grid" style:--columns={SLOTS.stashColumns}>
					{#each shown as { stack, index } (index)}
						<ItemSlot
							{board}
							ref={{ area: 'stash', index }}
							{stack}
							label="Stash slot {index + 1}"
						/>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<section class="panel loadout" aria-labelledby="loadout-title">
		<header>
			<h2 id="loadout-title">Loadout</h2>
			<CarriedWeight inventory={explorer.loadout} />
		</header>
		<LoadoutPanel inventory={explorer.loadout} {board} />
		{#if error || explorer.underground}
			<p class="note" class:error={!!error} role={error ? 'alert' : undefined}>
				{error || "You're underground: nothing can be changed until you're back."}
			</p>
		{/if}
	</section>
</div>

<ItemOverlays {board} />

<style>
	.outfit {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: flex-start;
		gap: 20px;
		/*
		 * The two panels always sit side by side, so in a narrower window the slots get smaller:
		 * 14 of them across (5 in the stash; 2, 4 and 3 in the loadout) and about 430px of
		 * everything else.
		 */
		--slot-size: clamp(48px, calc((100vw - 430px) / 14), 92px);
		/* Under the bar, and clear of the corner buttons at the bottom. */
		padding: 24px 0 84px;
	}

	/* The two containers: rounded, and see-through enough for the picture behind to show. */
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

	/* As wide as its slots; the loadout takes whatever is left. */
	.stash {
		flex: none;
	}

	.loadout {
		flex: 1;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	/* The loadout's title with what it weighs beside it. */
	header {
		display: flex;
		align-items: baseline;
		gap: 16px;
	}

	h2 {
		margin: 0 0 14px;
		font-size: 1.1rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.stash-body {
		display: flex;
		gap: 14px;
		min-height: 0;
	}

	.filters {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Round and white; the one in use is ringed. */
	.filter {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--text);
		color: #14110f;
		opacity: 0.55;
	}

	.filter:hover,
	.filter:focus-visible {
		opacity: 0.85;
		border-color: transparent;
	}

	.filter[aria-pressed='true'] {
		opacity: 1;
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent);
	}

	/* More slots can be bought later: the grid scrolls inside the panel. */
	.scroll {
		min-height: 0;
		overflow-y: auto;
		padding-right: 6px;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), auto);
		gap: 8px;
	}

	.note {
		margin: 20px 0 0;
		color: var(--muted);
	}

	.note.error {
		color: #ff9a70;
	}

	/* A phone: one above the other, and the page's own small padding. */
	@media (max-width: 720px) {
		.outfit {
			flex-direction: column;
			align-items: stretch;
			padding: 16px 16px 84px;
			--slot-size: clamp(40px, calc((100vw - 150px) / 9), 92px);
		}

		.panel {
			max-height: none;
		}

		.scroll {
			max-height: 60vh;
		}
	}
</style>
