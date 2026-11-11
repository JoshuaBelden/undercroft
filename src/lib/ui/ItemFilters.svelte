<script lang="ts">
	import type { ItemFilter } from './items.ts';

	/**
	 * The column of round buttons beside a grid of items (the stash, the store): show everything,
	 * or only one category (or the ammunition). Bind `filter` and filter the grid by it.
	 */
	interface Props {
		filter: ItemFilter;
	}

	let { filter = $bindable() }: Props = $props();

	/** The filters, top to bottom. Each icon is drawn in a 24-unit box. */
	const FILTERS: { id: ItemFilter; label: string; icon: string }[] = [
		{ id: 'all', label: 'All items', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
		{
			id: 'weapon',
			label: 'Weapons',
			icon: 'M19.5 3 21 4.5 10 15.5 8.5 14zM8 13l3 3-1.5 1.5-1-1L5 20l-1-1 3.500-3.500-1-1z'
		},
		{
			id: 'ammo',
			label: 'Ammunition',
			icon: 'M12 2c2 1.800 3 4.200 3 7v9H9V9c0-2.800 1-5.200 3-7zM9 19.500h6V22H9z'
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
</script>

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

<style>
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
</style>
