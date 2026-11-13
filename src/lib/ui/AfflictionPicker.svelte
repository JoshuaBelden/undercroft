<script lang="ts">
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import AfflictionPane from './AfflictionPane.svelte';
	import { dragScroll } from './dragScroll.ts';

	/**
	 * The host choosing what the expedition is against: the Afflictions' panes over the whole
	 * window; clicking one chooses it. Render it while it should be open. Escape asks to close it.
	 */
	interface Props {
		/** The explorer's rite progress, shown on the panes. */
		progress: ExplorerView['afflictions'];
		/** The one chosen now, if any. */
		selected: string | null;
		onselect: (id: string) => void;
		onclose: () => void;
	}

	let { progress, selected, onselect, onclose }: Props = $props();

	/** Opens it as a modal, and keeps its key presses from reaching the game's input map. */
	function modal(dialog: HTMLDialogElement): () => void {
		const quiet = (event: KeyboardEvent): void => event.stopPropagation();
		dialog.addEventListener('keydown', quiet);
		dialog.showModal();
		return () => {
			dialog.removeEventListener('keydown', quiet);
			dialog.close();
		};
	}

	function cancelled(event: Event): void {
		// The parent decides: it stops rendering the picker.
		event.preventDefault();
		onclose();
	}
</script>

<dialog
	{@attach modal}
	{@attach menu({ back: onclose })}
	aria-labelledby="picker-title"
	oncancel={cancelled}
>
	<header>
		<h2 id="picker-title">Choose an Affliction</h2>
		<button type="button" class="back" onclick={onclose}>Back</button>
	</header>
	<div class="track" use:dragScroll>
		{#each Object.keys(AFFLICTIONS) as id (id)}
			<AfflictionPane {id} {progress} selected={id === selected} onselect={() => onselect(id)} />
		{/each}
	</div>
</dialog>

<style>
	dialog {
		width: 100vw;
		max-width: none;
		height: 100vh;
		max-height: none;
		margin: 0;
		padding: 0 50px;
		border: 0;
		background: rgb(6 5 5 / 0.82);
		backdrop-filter: blur(8px);
		color: var(--text);
	}

	/* Only while open: a closed dialog must stay hidden. */
	dialog[open] {
		display: flex;
		flex-direction: column;
	}

	header {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 18px 0 0;
	}

	h2 {
		margin: 0;
		font-size: 1.4rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.back {
		padding: 6px 18px;
		border-color: var(--text);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.back:hover,
	.back:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	/* The strip of panes, centred; it scrolls once there are more than fit. */
	.track {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: safe center;
		justify-content: safe center;
		gap: 20px;
		padding: 14px 0;
		overflow: auto;
		cursor: grab;
		user-select: none;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.track:global(.dragging) {
		cursor: grabbing;
	}

	@media (max-width: 720px) {
		dialog {
			padding: 0 16px;
		}
	}
</style>
