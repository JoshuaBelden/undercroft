<script lang="ts">
	import { BACKPACKS } from '#lib/content/carry.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import type { InventoryAction } from '#lib/shared/items/types.ts';
	import type { Inventory } from '#lib/shared/player/types.ts';
	import CarriedWeight from './CarriedWeight.svelte';
	import { ItemBoard } from './itemBoard.svelte.ts';
	import ItemOverlays from './ItemOverlays.svelte';
	import LoadoutPanel from './LoadoutPanel.svelte';

	/**
	 * The pack screen underground: the same slots as the Loadout page, without a stash. Things are
	 * dragged between slots, shift-click sends one between the backpack and the slot it belongs
	 * in, and the alternate menu equips, splits and drops (onto the floor).
	 */
	interface Props {
		inventory: Inventory;
		onaction: (action: InventoryAction) => void;
		onclose: () => void;
	}

	let { inventory, onaction, onclose }: Props = $props();

	const board = new ItemBoard({
		belongings: () => ({ inventory }),
		act: (action) => onaction(action)
	});
</script>

<div class="backdrop">
	<section class="panel" aria-labelledby="pack-title" {@attach menu({ back: onclose })}>
		<header>
			<div class="title">
				<h2 id="pack-title">{BACKPACKS[inventory.pack]?.name ?? 'Your pack'}</h2>
				<CarriedWeight {inventory} />
			</div>
			<button type="button" onclick={onclose}>Close</button>
		</header>
		<LoadoutPanel {inventory} {board} showHand />
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
		max-width: 100%;
		max-height: calc(100vh - 32px);
		overflow-y: auto;
		padding: 18px 20px 20px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.82);
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		margin-bottom: 14px;
	}

	.title {
		display: flex;
		align-items: baseline;
		gap: 16px;
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
</style>
