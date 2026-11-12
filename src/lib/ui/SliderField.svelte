<script lang="ts">
	/** A number on a TabScreen: the pill is the slider, filled up to the value. */
	interface Props {
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		/** The value as shown at the right of the pill. */
		text: string;
		onset: (value: number) => void;
		hint?: string;
	}

	let { label, value, min, max, step, text, onset, hint }: Props = $props();
</script>

<div class="setting">
	<label class="pill range" style:--fill="{((value - min) / (max - min)) * 100}%">
		<span class="name">{label}</span>
		<span class="value">{text}</span>
		<input
			type="range"
			{min}
			{max}
			{step}
			{value}
			oninput={(event) => onset(Number(event.currentTarget.value))}
		/>
	</label>
	{#if hint}
		<p class="hint">{hint}</p>
	{/if}
</div>

<style>
	/* The slider itself is invisible and covers the pill; the fill behind the text shows the value. */
	.range {
		cursor: ew-resize;
	}

	.range::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--fill);
		background: rgb(0 129 157 / 0.35);
	}

	.range .name {
		position: relative;
	}

	.range input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: ew-resize;
	}
</style>
