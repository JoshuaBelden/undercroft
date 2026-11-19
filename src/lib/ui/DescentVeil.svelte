<script lang="ts">
	import { EXPEDITION } from '#lib/content/expedition.ts';
	import { descent } from './descent.svelte.ts';

	interface Props {
		/** On the play page: under its loading bar, over the world and the HUD. */
		underLoading?: boolean;
	}

	let { underLoading = false }: Props = $props();
</script>

<!-- The dark between the countdown and the start room (descent.svelte.ts). -->
{#if descent.dark}
	<div
		class="veil"
		class:fading={descent.fading}
		class:under-loading={underLoading}
		style:--fade="{EXPEDITION.arriveFadeSeconds}s"
		aria-hidden="true"
	></div>
{/if}

<style>
	.veil {
		position: fixed;
		inset: 0;
		z-index: 45;
		background: #000;
	}

	.under-loading {
		z-index: 17;
	}

	.fading {
		pointer-events: none;
		animation: lift var(--fade) ease-in forwards;
	}

	@keyframes lift {
		to {
			opacity: 0;
		}
	}
</style>
