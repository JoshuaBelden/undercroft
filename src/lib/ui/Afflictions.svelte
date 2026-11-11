<script lang="ts">
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import AfflictionPane from './AfflictionPane.svelte';
	import { dragScroll } from './dragScroll.ts';

	interface Props {
		/** The explorer's rite progress (only Afflictions with any). */
		progress: ExplorerView['afflictions'];
		/** Given, each known pane has a Join Expedition button that calls this with its id. */
		onjoin?: (id: string) => void;
		/** Why joining is not possible right now (the buttons are disabled). */
		joinBlocked?: string;
	}

	let { progress, onjoin, joinBlocked }: Props = $props();

	/** Panes shown after the real ones for Afflictions nobody has met yet. */
	const UNKNOWN_PANES = 4;
</script>

<div class="afflictions">
	<div class="track" use:dragScroll>
		{#each Object.keys(AFFLICTIONS) as id (id)}
			<AfflictionPane {id} {progress} {joinBlocked} onjoin={onjoin && (() => onjoin(id))} />
		{/each}
		{#each { length: UNKNOWN_PANES }, index (index)}
			<AfflictionPane id={null} {progress} />
		{/each}
	</div>
	<p class="note">
		What you don't know yet is written on scraps down there. What you learn, you keep.
	</p>
</div>

<style>
	.afflictions {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
	}

	/* The strip of panes: scrolls sideways, by dragging (dragScroll), touch or the scrollbar. */
	.track {
		flex: none;
		display: flex;
		gap: 20px;
		padding: 24px 0 14px;
		overflow-x: auto;
		cursor: grab;
		user-select: none;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.track:global(.dragging) {
		cursor: grabbing;
	}

	/* Under the strip, clear of the corner buttons. */
	.note {
		margin: 0;
		padding: 0 140px 24px;
		text-align: center;
		color: var(--muted);
	}

	@media (max-width: 480px) {
		.track {
			gap: 12px;
			padding: 16px 0 12px;
		}

		.note {
			padding: 0 16px 80px;
		}
	}
</style>
