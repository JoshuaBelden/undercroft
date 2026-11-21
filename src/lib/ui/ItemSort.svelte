<script lang="ts">
	import { SORT_LABELS, type ItemSortOrder } from './items.ts';

	/**
	 * The order a grid of items is shown in (the stash, the store), below its filters: one round
	 * button that steps through As placed, By value, By name and By type. Bind `order` and sort the
	 * grid by it (`sortItems`).
	 */
	interface Props {
		order: ItemSortOrder;
	}

	let { order = $bindable() }: Props = $props();

	const ORDERS = Object.keys(SORT_LABELS) as ItemSortOrder[];

	/** Each order's icon, in a 24-unit box. */
	const ICONS: Record<ItemSortOrder, string> = {
		placed: 'M4 5h16v3H4zM4 10.500h16v3H4zM4 16h16v3H4z',
		value:
			'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM11 6v1.600c-1.700.400-2.800 1.500-2.800 3 0 1.800 1.500 2.500 3.300 2.900 1.300.300 1.700.600 1.700 1.100 0 .500-.600.900-1.400.900-1 0-1.700-.400-2-1.200l-1.800.800c.400 1.100 1.500 1.900 3 2.200V19h2v-1.700c1.800-.400 2.900-1.500 2.900-3.100 0-1.900-1.500-2.600-3.400-3-1.200-.300-1.600-.500-1.600-1 0-.400.500-.800 1.200-.800.800 0 1.300.300 1.600 1l1.800-.800c-.400-1-1.300-1.700-2.500-2V6z',
		name: 'M3 19l4.500-14h2L14 19h-2.200l-1-3.200H6.200L5.200 19zM6.800 13.800h3.400L8.500 8.300zM15 17h6v2h-6zM15 12h5v2h-5zM15 7h4v2h-4z',
		type: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 15h3v3h-3z'
	};

	function next(): void {
		order = ORDERS[(ORDERS.indexOf(order) + 1) % ORDERS.length];
	}
</script>

<button
	type="button"
	class="sort"
	aria-label="Sort: {SORT_LABELS[order]}"
	title="Sort: {SORT_LABELS[order]}"
	onclick={next}
>
	<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
		<path fill="currentColor" d={ICONS[order]} />
	</svg>
</button>

<style>
	/* Like the filters above it, but dark, so it reads as something else. */
	.sort {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 2px solid var(--text);
		border-radius: 50%;
		background: transparent;
		color: var(--text);
		opacity: 0.8;
	}

	.sort:hover,
	.sort:focus-visible {
		opacity: 1;
	}
</style>
