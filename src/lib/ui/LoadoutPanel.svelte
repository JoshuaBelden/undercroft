<script lang="ts">
	import { BACKPACKS, DEFAULT_BACKPACK } from '#lib/content/carry.ts';
	import { HAND, type Inventory } from '#lib/shared/player/types.ts';
	import type { ItemBoard } from './itemBoard.svelte.ts';
	import ItemSlot from './ItemSlot.svelte';

	/**
	 * An inventory as slots: EQUIPMENT (two weapons, large, and the defense slot under them),
	 * BACKPACK and, to its right, QUICK USE. The Loadout page shows an explorer's
	 * loadout with it and the pack screen what you carry underground.
	 */
	interface Props {
		inventory: Inventory;
		board: ItemBoard;
		/** Mark the slot that is in the hand (underground). */
		showHand?: boolean;
	}

	let { inventory, board, showHand = false }: Props = $props();

	const columns = $derived((BACKPACKS[inventory.pack] ?? BACKPACKS[DEFAULT_BACKPACK]).columns);
	const hand = $derived(showHand ? inventory.selected : -1);
</script>

<div class="sections">
	<section>
		<h3>Equipment</h3>
		<div class="equipment">
			<div class:hand={hand === HAND.primary}>
				<ItemSlot
					{board}
					ref={{ area: 'equipment', slot: 'primary' }}
					stack={inventory.equipment.primary}
					size="large"
					hint="Primary"
					label="Primary weapon"
				/>
			</div>
			<div class:hand={hand === HAND.secondary}>
				<ItemSlot
					{board}
					ref={{ area: 'equipment', slot: 'secondary' }}
					stack={inventory.equipment.secondary}
					size="large"
					hint="Secondary"
					label="Secondary weapon"
				/>
			</div>
			<ItemSlot
				{board}
				ref={{ area: 'equipment', slot: 'defense' }}
				stack={inventory.equipment.defense}
				hint="Defense"
				label="Defense"
			/>
		</div>
	</section>

	<section>
		<h3>Backpack</h3>
		<div class="grid" style:--columns={columns}>
			{#each inventory.backpack as stack, index (index)}
				<ItemSlot
					{board}
					ref={{ area: 'backpack', index }}
					{stack}
					label="Backpack slot {index + 1}"
				/>
			{/each}
		</div>
	</section>

	<section>
		<h3>Quick use</h3>
		<div class="grid" style:--columns="3">
			{#each inventory.quick as stack, index (index)}
				<div class:hand={hand === HAND.quick + index}>
					<ItemSlot
						{board}
						ref={{ area: 'quick', index }}
						{stack}
						label="Quick-use slot {index + 1}"
					/>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.sections {
		display: flex;
		/* Always in a row: equipment, the backpack, quick use to its right. */
		align-items: flex-start;
		gap: 32px;
	}

	h3 {
		margin: 0 0 10px;
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.equipment {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), auto);
		gap: 8px;
	}

	/* In the hand right now. */
	.hand :global(.slot) {
		--slot-border: var(--text);
		box-shadow: inset 0 0 0 1px var(--text);
	}
</style>
