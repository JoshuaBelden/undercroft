<script lang="ts">
	/**
	 * "+X Experience" just under the clock while underground, each line fading as it goes. Plain
	 * text, no box. See docs/dev/progression.md.
	 */
	interface Props {
		/** Gains still showing, oldest first. */
		gains: { id: number; amount: number }[];
	}

	let { gains }: Props = $props();
</script>

<div class="gains" aria-live="polite">
	{#each gains as gain (gain.id)}
		<span class="gain">+{gain.amount} Experience</span>
	{/each}
</div>

<style>
	.gains {
		position: fixed;
		top: 46px;
		left: 50%;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 2px;
		pointer-events: none;
		z-index: 6;
	}

	.gain {
		font-weight: 700;
		font-size: 0.95rem;
		color: #fff;
		white-space: nowrap;
		animation: fade 2.5s ease-in forwards;
	}

	@keyframes fade {
		0%,
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.gain {
			animation: none;
		}
	}
</style>
