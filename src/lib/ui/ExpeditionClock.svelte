<script lang="ts">
	/**
	 * Top centre while underground: the time left before anyone still down here is lost. It takes
	 * no clicks. See docs/dev/expedition.md.
	 */
	interface Props {
		/** Seconds left. */
		seconds: number;
	}

	let { seconds }: Props = $props();

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
</div>

<style>
	.clock {
		position: fixed;
		top: 14px;
		left: 50%;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
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
</style>
