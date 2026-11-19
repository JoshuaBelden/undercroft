<script lang="ts">
	/**
	 * Admin (dev mode): how full the party's noise and light meters are (a witch comes when one
	 * fills), and the Affliction's meter (the omens), as bars under the clock. See
	 * docs/dev/creatures.md#attraction.
	 */
	interface Props {
		/** 0..1 each; null before the first tick with them. */
		noise: number | null;
		light: number | null;
		omen: number | null;
		/** Witches alive now. */
		witches: number | null;
		/** Why the last witch came (a meter, an omen, a dweller turning, admin), and when. */
		last: { cause: string; seconds: number } | null;
	}

	let { noise, light, omen, witches, last }: Props = $props();

	const bars = $derived([
		{ label: 'Noise', value: noise },
		{ label: 'Light', value: light },
		{ label: 'Omen', value: omen }
	]);
</script>

<div class="bars" aria-label="Attraction meters">
	{#each bars as bar (bar.label)}
		<div class="bar">
			<span class="label">{bar.label}</span>
			<span class="track">
				<span class="fill" style:width="{Math.round((bar.value ?? 0) * 100)}%"></span>
			</span>
			<span class="value">{bar.value === null ? '—' : `${Math.round(bar.value * 100)}%`}</span>
		</div>
	{/each}
	<p class="last">
		Witches: {witches ?? '—'}
		{#if last}· last: {last.cause}, {last.seconds}s ago{/if}
	</p>
</div>

<style>
	.bars {
		position: fixed;
		top: 48px;
		left: 50%;
		transform: translateX(-50%);
		display: grid;
		gap: 4px;
		width: min(300px, calc(100vw - 32px));
		pointer-events: none;
		z-index: 6;
	}

	.bar {
		display: grid;
		grid-template-columns: 3.5em 1fr 3em;
		align-items: center;
		gap: 6px;
		font: 500 0.75rem var(--font-body, sans-serif);
		color: var(--text);
		text-shadow: 0 0 6px rgb(0 0 0 / 0.9);
	}

	.track {
		height: 6px;
		border-radius: 3px;
		background: rgb(0 0 0 / 0.55);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		background: #d9a54a;
	}

	.last {
		margin: 0;
		text-align: center;
		font: 500 0.7rem var(--font-body, sans-serif);
		color: var(--text);
		text-shadow: 0 0 6px rgb(0 0 0 / 0.9);
	}

	.value {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
