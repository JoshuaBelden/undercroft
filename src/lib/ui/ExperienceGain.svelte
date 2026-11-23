<script lang="ts">
	/**
	 * "+X Experience" a third of the way down the screen while underground, in the lore face at the
	 * size of a contact's name, each line fading as it goes. Plain text, no box. See docs/dev/progression.md.
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
		top: 33%;
		left: 50%;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 4px;
		pointer-events: none;
		z-index: 6;
	}

	.gain {
		/* As a contact's name (Contact.svelte), with a shadow to read over the dark. */
		font: 400 2rem var(--font-lore);
		letter-spacing: 0.08em;
		color: #fff;
		text-shadow: 0 2px 6px rgb(0 0 0 / 0.85);
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
