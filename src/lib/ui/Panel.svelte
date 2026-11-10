<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		onclose: () => void;
		children: Snippet;
	}

	let { title, onclose, children }: Props = $props();
</script>

<div class="backdrop">
	<section class="panel" aria-label={title}>
		<header>
			<h2>{title}</h2>
			<button type="button" onclick={onclose}>Close</button>
		</header>
		<div class="body">
			{@render children()}
		</div>
	</section>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgb(0 0 0 / 0.6);
		z-index: 20;
	}

	.panel {
		width: min(640px, calc(100vw - 32px));
		max-height: calc(100vh - 64px);
		display: flex;
		flex-direction: column;
		background: var(--panel);
		border: 1px solid var(--border);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.body {
		padding: 16px;
		overflow-y: auto;
	}
</style>
