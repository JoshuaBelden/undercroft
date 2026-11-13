<script lang="ts">
	/** A choice (or on/off) on a TabScreen: arrows either side of the value step through it. */
	interface Props {
		label: string;
		/** The value as shown between the arrows. */
		text: string;
		/** An arrow was pressed: -1 for the left one, 1 for the right. */
		onstep: (by: number) => void;
		hint?: string;
		disabled?: boolean;
	}

	let { label, text, onstep, hint, disabled = false }: Props = $props();
</script>

<div class="setting">
	<div class="pill steps" role="group" aria-label={label}>
		<span class="name">{label}</span>
		<span class="stepper" data-pad-stepper>
			<button
				type="button"
				class="arrow"
				aria-label="Previous"
				{disabled}
				onclick={() => onstep(-1)}>&lt;</button
			>
			<span class="value" aria-live="polite">{text}</span>
			<button type="button" class="arrow" aria-label="Next" {disabled} onclick={() => onstep(1)}
				>&gt;</button
			>
		</span>
	</div>
	{#if hint}
		<p class="hint">{hint}</p>
	{/if}
</div>

<style>
	.steps {
		padding-right: 6px;
	}

	.stepper {
		display: flex;
		align-items: center;
	}

	.stepper .value {
		min-width: 3em;
		text-align: center;
	}

	.arrow {
		padding: 4px 8px;
		border: none;
		font-weight: 700;
		color: var(--muted);
	}

	.arrow:hover:not(:disabled),
	.arrow:focus-visible {
		color: var(--text);
	}

	.arrow:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
