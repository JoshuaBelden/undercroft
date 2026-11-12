<script lang="ts">
	import { FILTER_ICONS, type ItemFilter } from './items.ts';

	/**
	 * The column of round buttons beside a grid of items (the stash, the store): show everything,
	 * or only one category (or the ammunition, the treasure or the quest items). Bind `filter` and filter the grid by it.
	 */
	interface Props {
		filter: ItemFilter;
	}

	let { filter = $bindable() }: Props = $props();

	/** The filters, top to bottom. The icons are `FILTER_ICONS`. */
	const FILTERS: { id: ItemFilter; label: string }[] = [
		{ id: 'all', label: 'All items' },
		{ id: 'weapon', label: 'Weapons' },
		{ id: 'ammo', label: 'Ammunition' },
		{ id: 'defense', label: 'Defense' },
		{ id: 'quick', label: 'Quick use' },
		{ id: 'treasure', label: 'Treasure' },
		{ id: 'quest', label: 'Quest items' },
		{ id: 'other', label: 'Other' }
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
				<path fill="currentColor" d={FILTER_ICONS[entry.id]} />
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
