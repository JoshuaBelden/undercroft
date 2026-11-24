<script lang="ts">
	/** A code sample, with the file or context it belongs in above it. */
	let { code, label }: { code: string; label?: string } = $props();
</script>

<figure>
	{#if label}<figcaption>{label}</figcaption>{/if}
	<pre><code>{code.trim()}</code></pre>
</figure>

<style>
	figure {
		margin: 1rem 0 1.4rem;
		max-width: 50rem;
	}
	figcaption {
		font-size: 0.8rem;
		color: var(--muted);
		font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
		margin-bottom: 0.3rem;
	}
	pre {
		margin: 0;
		background: var(--code-bg);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 0.9rem 1.1rem;
		overflow-x: auto;
		line-height: 1.5;
	}
	pre code {
		background: none;
		padding: 0;
		font-size: 0.86rem;
	}
</style>
