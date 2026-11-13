<script lang="ts">
	import type { Snippet } from 'svelte';
	import { BACKDROP_IMAGE } from '#lib/content/images.ts';
	import { parallax } from './parallax.ts';

	/**
	 * The frame of every signed-out page (sign in, sign up, forgot password, the two-step code):
	 * one small form on the backdrop. Its fields use plain `label > span + input`, `.primary` for
	 * the main button, `.muted` and `.error` for text: styled here.
	 */
	interface Props {
		title: string;
		onsubmit: (event: SubmitEvent) => void;
		children: Snippet;
	}

	let { title, onsubmit, children }: Props = $props();
</script>

<main class="backdrop-art" style:--backdrop-image={BACKDROP_IMAGE} use:parallax>
	<form {onsubmit}>
		<h2>{title}</h2>
		{@render children()}
	</form>
</main>

<style>
	main {
		min-height: 100vh;
		display: grid;
		place-content: center;
		justify-items: center;
		padding: 24px;
	}

	form {
		/* A field's fill: solid, so the autofill cover below matches it exactly. */
		--field: #0c0a09;
		width: min(360px, calc(100vw - 48px));
		display: grid;
		gap: 14px;
		padding: 24px;
		background: var(--panel);
		border: 1px solid var(--border);
	}

	h2 {
		margin: 0 0 4px;
		font-size: 1rem;
		font-weight: normal;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	form :global(label) {
		display: grid;
		gap: 6px;
	}

	form :global(label > span) {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}

	/* Fields are pills, like the settings' (src/lib/ui/TabScreen.svelte). */
	form :global(input) {
		width: 100%;
		height: 40px;
		padding: 0 16px;
		border: 1px solid var(--border);
		border-radius: 999px;
		outline: none;
		background: var(--field);
		color: var(--text);
		font-size: 0.95rem;
	}

	form :global(input:hover),
	form :global(input:focus-visible) {
		border-color: var(--accent);
	}

	form :global(input:disabled) {
		opacity: 0.5;
	}

	/*
	 * A field the browser filled in itself (a saved email or password): it would paint it pale
	 * yellow, which can't be overridden with a background. An inset shadow of the field's own colour
	 * covers it, and the text keeps its colour.
	 */
	form :global(input:-webkit-autofill),
	form :global(input:-webkit-autofill:hover),
	form :global(input:-webkit-autofill:focus) {
		-webkit-text-fill-color: var(--text);
		caret-color: var(--text);
		box-shadow: 0 0 0 40px var(--field) inset;
	}

	/* The buttons match the fields. */
	form :global(button),
	form :global(.discord) {
		min-height: 40px;
		border-radius: 999px;
	}

	form :global(.primary) {
		border-color: var(--accent);
	}

	form :global(.muted) {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
	}

	form :global(.error) {
		margin: 0;
		color: #ff9a70;
	}

	form :global(a) {
		color: var(--text);
	}

	/* "or", between the form and another way in. */
	form :global(.or) {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--muted);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	form :global(.or::before),
	form :global(.or::after) {
		content: '';
		flex: 1;
		border-top: 1px solid var(--border);
	}

	form :global(.discord) {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 8px 12px;
		border: 1px solid var(--border);
		text-decoration: none;
	}

	form :global(.discord:hover),
	form :global(.discord:focus-visible) {
		border-color: #5865f2;
	}
</style>
