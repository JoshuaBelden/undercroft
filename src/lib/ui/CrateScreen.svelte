<script lang="ts">
	import { BACKPACKS } from '#lib/content/carry.ts';
	import { CRATES } from '#lib/content/loot.ts';
	import type { CrateSlot, InventoryAction } from '#lib/shared/items/types.ts';
	import type { Inventory } from '#lib/shared/player/types.ts';
	import CarriedWeight from './CarriedWeight.svelte';
	import { ItemBoard } from './itemBoard.svelte.ts';
	import ItemOverlays from './ItemOverlays.svelte';
	import ItemSlot from './ItemSlot.svelte';
	import LoadoutPanel from './LoadoutPanel.svelte';

	/**
	 * The loot screen: the crate you have open beside what you carry. Things go both ways with
	 * the same slot mechanics as the pack screen (drag, shift-click, the alternate menu).
	 *
	 * What is in the crate is revealed by the server a slot at a time. Until then a slot shows
	 * only that something is there, and how far along it is; it can't be touched.
	 */
	interface Props {
		inventory: Inventory;
		/** The crate's slots as the server tells them: `'hidden'` is something not revealed yet. */
		slots: CrateSlot[];
		/** How far along (0..1) the first hidden slot is to being revealed. */
		reveal: number;
		/** What to press to walk away, e.g. "W / A / S / D". */
		moveKeys: string;
		onaction: (action: InventoryAction) => void;
		onclose: () => void;
	}

	let { inventory, slots, reveal, moveKeys, onaction, onclose }: Props = $props();

	/** The slot being revealed now: the first hidden one. */
	const revealing = $derived(slots.indexOf('hidden'));
	const left = $derived(slots.filter((slot) => slot === 'hidden').length);

	const board = new ItemBoard({
		belongings: () => ({
			inventory,
			stash: slots.map((slot) => (slot === 'hidden' ? null : slot)),
			sealed: new Set(slots.flatMap((slot, index) => (slot === 'hidden' ? [index] : [])))
		}),
		act: (action) => onaction(action)
	});
</script>

<div class="backdrop">
	<section class="panel" aria-labelledby="crate-title">
		<header>
			<div class="title">
				<h2 id="crate-title">Crate</h2>
				<p class="status" role="status">
					{left > 0 ? 'Searching...' : 'Searched'}
				</p>
			</div>
			<p class="hint">Move ({moveKeys}) to step away</p>
			<button type="button" onclick={onclose}>Close</button>
		</header>

		<div class="body">
			<section class="crate">
				<h3>Inside</h3>
				<div class="grid" style:--columns={CRATES.columns}>
					{#each slots as slot, index (index)}
						{#if slot === 'hidden'}
							<span
								class="sealed"
								class:revealing={index === revealing}
								role="img"
								aria-label="Crate slot {index + 1}: {index === revealing
									? 'being searched'
									: 'not searched yet'}"
							>
								{#if index === revealing}
									<span class="bar"><span class="fill" style:width="{reveal * 100}%"></span></span>
								{/if}
							</span>
						{:else}
							<ItemSlot
								{board}
								ref={{ area: 'stash', index }}
								stack={slot}
								label="Crate slot {index + 1}"
							/>
						{/if}
					{/each}
				</div>
			</section>

			<section class="pack">
				<div class="pack-title">
					<h3>{BACKPACKS[inventory.pack]?.name ?? 'Your pack'}</h3>
					<CarriedWeight {inventory} />
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

	/* Most of the window, not all of it: the catacombs stay in sight round the edge. */
	.panel {
		box-sizing: border-box;
		width: min(1500px, 88vw);
		min-height: min(760px, 78vh);
		max-height: calc(100vh - 32px);
		display: flex;
		flex-direction: column;
		overflow: auto;
		padding: 22px 28px 28px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.86);
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	header {
		display: flex;
		align-items: center;
		gap: 20px;
		margin-bottom: 22px;
	}

	.title {
		display: flex;
		align-items: baseline;
		gap: 16px;
		margin-right: auto;
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	p {
		margin: 0;
	}

	.status,
	.hint {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		color: var(--muted);
	}

	.body {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 48px;
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

	.grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), auto);
		gap: 8px;
	}

	/* Something is in here that hasn't been seen yet: the size of a slot, and nothing to hold. */
	.sealed {
		box-sizing: border-box;
		width: var(--slot-size, 92px);
		height: var(--slot-size, 92px);
		display: grid;
		place-items: center;
		padding: 12px;
		border: 1px dashed var(--border);
		border-radius: 12px;
		background: rgb(0 0 0 / 0.35);
	}

	.sealed.revealing {
		border-style: solid;
		border-color: var(--muted);
	}

	.bar {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: rgb(255 255 255 / 0.1);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		background: var(--text);
		/* The server says how far along it is a few times a second: smooth between. */
		transition: width 0.08s linear;
	}
</style>
