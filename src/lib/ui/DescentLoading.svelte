<script lang="ts">
	import type { LoadProgress } from '#lib/game/preload.ts';

	interface Props {
		/** What has loaded so far for this run (see src/lib/game/preload.ts). */
		progress: LoadProgress;
	}

	let { progress }: Props = $props();

	const percent = $derived(
		progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0
	);
</script>

<div class="loading" role="status" aria-live="polite">
	<p>Descending</p>
	<div
		class="bar"
		role="progressbar"
		aria-label="Loading the catacombs"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={percent}
	>
		<div class="fill" style:width="{percent}%"></div>
	</div>
</div>

<style>
	.loading {
		position: fixed;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 22px;
		z-index: 18;
		background: #000;
	}

	p {
		margin: 0;
		font: 400 1.6rem var(--font-lore);
		letter-spacing: 0.4em;
		text-transform: uppercase;
		color: var(--text);
	}

	.bar {
		width: min(320px, 70vw);
		height: 2px;
		background: rgb(226 220 204 / 0.15);
	}

	.fill {
		height: 100%;
		background: var(--text);
		transition: width 0.2s ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
