<script lang="ts">
	/**
	 * Top centre while underground: the time left before anyone still down here is lost, and under
	 * it a thin red bar filling as the Affliction draws near. It takes no clicks. See
	 * docs/dev/expedition.md.
	 */
	interface Props {
		/** Seconds left. */
		seconds: number;
		/** 0..1, how near it is to arriving; null once it has arrived or been calmed (no bar). */
		arrival: number | null;
	}

	let { seconds, arrival }: Props = $props();

	/** Under this many seconds the time turns red. */
	const LOW = 300;

	const time = $derived.by(() => {
		const left = Math.max(0, Math.ceil(seconds));
		const minutes = Math.floor(left / 60);
		return `${minutes}:${String(left % 60).padStart(2, '0')}`;
	});
</script>

<div class="clock" class:low={seconds <= LOW} aria-label="Time left before you must be out">
	<span class="time">{time}</span>
	{#if arrival !== null}
		<span
			class="bar"
			role="progressbar"
			aria-label="The Affliction draws near"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(arrival * 100)}
		>
			<span class="fill" style:width="{Math.min(1, Math.max(0, arrival)) * 100}%"></span>
		</span>
	{/if}
</div>

<style>
	.clock {
		--red: #b3261e;
		position: fixed;
		top: 14px;
		left: 50%;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 6px;
		pointer-events: none;
		z-index: 6;
	}

	.time {
		font: 600 1.25rem var(--font-display);
		letter-spacing: 0.08em;
		font-variant-numeric: tabular-nums;
		color: var(--text);
		text-shadow: 0 0 8px rgb(0 0 0 / 0.9);
	}

	.clock.low .time {
		color: #e0544a;
	}

	.bar {
		display: block;
		box-sizing: border-box;
		width: min(220px, 50vw);
		height: 4px;
		border: 1px solid var(--red);
		background: rgb(0 0 0 / 0.45);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		background: var(--red);
		transition: width 1s linear;
	}
</style>
