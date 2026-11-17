<script lang="ts">
	import { BACKPACKS } from '#lib/content/carry.ts';
	import type { InventoryAction } from '#lib/shared/items/types.ts';
	import type { Inventory } from '#lib/shared/player/types.ts';
	import CarriedWeight from './CarriedWeight.svelte';
	import { ItemBoard } from './itemBoard.svelte.ts';
	import ItemOverlays from './ItemOverlays.svelte';
	import LoadoutPanel from './LoadoutPanel.svelte';

	/**
	 * The pack underground, on the Pack tab of the in-game menu (GameMenu): the same slots as the
	 * Loadout page, without a stash. Things are dragged between slots, shift-click sends one
	 * between the backpack and the slot it belongs in, and the alternate menu equips, splits and
	 * drops (onto the floor).
	 */
	interface Props {
		inventory: Inventory;
		onaction: (action: InventoryAction) => void;
	}

	let { inventory, onaction }: Props = $props();

	const board = new ItemBoard({
		belongings: () => ({ inventory }),
		act: (action) => onaction(action)
	});
</script>

<div class="title">
	<h2>{BACKPACKS[inventory.pack]?.name ?? 'Your pack'}</h2>
	<CarriedWeight {inventory} />
</div>
<LoadoutPanel {inventory} {board} showHand />

<ItemOverlays {board} />

<style>
	.title {
		display: flex;
		align-items: baseline;
		gap: 16px;
		margin-bottom: 14px;
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
</style>
