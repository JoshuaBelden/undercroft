<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A small modal dialog for questions and confirmations anywhere in the game: a header with the
	 * title, the content, and a footer of commands. Buttons put in `footer` are drawn as pills; give
	 * the one that carries out the action `class="primary"`.
	 *
	 * Render it while it should be open (`{#if asking}<Dialog ...>`). Escape asks to close it.
	 */
	interface Props {
		title: string;
		/** Escape was pressed: the dialog should be taken away. */
		onclose: () => void;
		/** What the dialog says. */
		children: Snippet;
		/** The command buttons, in order, centred in the footer. */
		footer: Snippet;
	}

	let { title, onclose, children, footer }: Props = $props();

	/** Opens the dialog as a modal, and keeps its key presses from reaching the game's input map. */
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
		// The parent decides: it stops rendering the dialog.
		event.preventDefault();
		onclose();
	}
</script>

<dialog {@attach modal} aria-labelledby="dialog-title" oncancel={cancelled}>
	<header>
		<h2 id="dialog-title">{title}</h2>
	</header>
	<div class="content">
		{@render children()}
	</div>
	<footer>
		{@render footer()}
	</footer>
</dialog>

<style>
	dialog {
		width: min(440px, calc(100vw - 32px));
		max-height: calc(100vh - 64px);
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 18px;
		/* A little see-through: the blurred screen behind shows faintly. */
		background: rgb(20 17 15 / 0.8);
		color: var(--text);
		overflow: hidden;
	}

	/* Only while open: a closed dialog must stay hidden. */
	dialog[open] {
		display: flex;
		flex-direction: column;
	}

	dialog::backdrop {
		background: rgb(0 0 0 / 0.5);
		backdrop-filter: blur(6px);
	}

	header {
		padding: 14px 20px;
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.content {
		min-height: 0;
		overflow-y: auto;
		padding: 18px 20px;
		line-height: 1.5;
		/* Light, with dark text: the part to read stands out from the header and footer. */
		background: rgb(226 220 204 / 0.88);
		color: #14110f;
	}

	.content :global(p) {
		margin: 0 0 10px;
	}

	.content :global(p:last-child) {
		margin-bottom: 0;
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
		padding: 14px 20px;
		border-top: 1px solid var(--border);
		/* Between the two: darker than the content, lighter than the header. */
		background: rgb(226 220 204 / 0.3);
	}

	/* The commands come from the parent, so they are styled from here. */
	footer :global(button) {
		padding: 7px 20px;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	footer :global(button:hover),
	footer :global(button:focus-visible) {
		background: rgb(255 255 255 / 0.1);
	}

	footer :global(button.primary) {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}

	footer :global(button.primary:hover),
	footer :global(button.primary:focus-visible) {
		border-color: var(--text);
		background: var(--accent);
	}
</style>
