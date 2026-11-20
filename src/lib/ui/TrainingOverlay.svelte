<script lang="ts">
	import type { HitNumber } from '#lib/game/play/training.svelte.ts';

	/**
	 * The training ground's overlay (docs/dev/rumors.md): the numbers rising off the dummies as
	 * they are hit. (Its tutorial steps are alerts.)
	 */
	let { numbers }: { numbers: HitNumber[] } = $props();
</script>

{#each numbers as number (number.id)}
	<span
		class="number"
		style:left="{number.x}px"
		style:top="{number.y}px"
		style:opacity={number.fade}
		aria-hidden="true">{number.text}</span
	>
{/each}

<style>
	.number {
		position: fixed;
		z-index: 40;
		translate: -50% -50%;
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 600;
		color: #f2d48a;
		text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
		pointer-events: none;
	}
</style>
