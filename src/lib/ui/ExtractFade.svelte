<script lang="ts">
	interface Props {
		/** Seconds to fade fully to black. */
		seconds: number;
	}

	let { seconds }: Props = $props();
</script>

<div class="fade" style:--fade="{seconds}s" role="status">
	<p>Extracting</p>
</div>

<style>
	.fade {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		z-index: 19;
		pointer-events: none;
		background: #000;
		animation: darken var(--fade) ease-in forwards;
	}

	p {
		margin: 0;
		font: 400 1.6rem var(--font-lore);
		letter-spacing: 0.4em;
		text-transform: uppercase;
		color: var(--text);
		animation: word var(--fade) ease-out forwards;
	}

	/* The world goes dark under the word; by the end there is only black. */
	@keyframes darken {
		from {
			background: rgb(0 0 0 / 0);
		}
		to {
			background: rgb(0 0 0 / 1);
		}
	}

	@keyframes word {
		0% {
			opacity: 0;
		}
		20%,
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		p {
			animation: none;
		}
	}
</style>
