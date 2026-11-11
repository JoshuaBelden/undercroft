<script lang="ts">
	import Dialog from './Dialog.svelte';

	/**
	 * Asks how many: of a stack to split off, or to sell. A slider with the number beside it, and
	 * what it comes to when there is a price.
	 */
	interface Props {
		title: string;
		/** What is being counted ("Bandage"). */
		name: string;
		/** The most that can be chosen (the least is 1). */
		max: number;
		/** What the confirming button says ("Split", "Sell"). */
		confirm: string;
		/** What one is worth, with `price` to write a sum ("25 coin"): shows the total. */
		each?: number;
		price?: (amount: number) => string;
		onconfirm: (count: number) => void;
		onclose: () => void;
	}

	let { title, name, max, confirm, each, price, onconfirm, onclose }: Props = $props();

	// Splitting starts at half; selling at all of it. The slider then moves it.
	let count = $derived(each === undefined ? Math.max(1, Math.floor(max / 2)) : max);

	const total = $derived(each === undefined ? null : each * count);
</script>

<Dialog {title} {onclose}>
	<p class="what">{name}</p>
	<div class="row">
		<input type="range" min="1" {max} step="1" aria-label="How many" bind:value={count} />
		<output>{count} <span class="of">of {max}</span></output>
	</div>
	{#if total !== null}
		<p class="total">For <strong>{price ? price(total) : total}</strong></p>
	{/if}
	{#snippet footer()}
		<button type="button" onclick={onclose}>Cancel</button>
		<button type="button" class="primary" onclick={() => onconfirm(count)}>{confirm}</button>
	{/snippet}
</Dialog>

<style>
	.what {
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 600;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	input {
		flex: 1;
		min-width: 0;
	}

	output {
		min-width: 4.5em;
		text-align: right;
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.of {
		font-size: 0.9rem;
		font-weight: 400;
		opacity: 0.7;
	}

	.total {
		margin-top: 10px;
	}
</style>
