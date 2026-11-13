<script lang="ts">
	import type { Inline } from '#lib/content/changelog.ts';

	/** A run of text with bold, code and links: one line of the release notes. */
	let { parts }: { parts: Inline[] } = $props();
</script>

{#each parts as part, i (i)}{#if part.url}<a href={part.url} rel="external">{part.text}</a
		>{:else if part.code}<code>{part.text}</code>{:else if part.bold}<strong>{part.text}</strong
		>{:else}{part.text}{/if}{/each}

<style>
	code {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	a {
		color: var(--text);
	}
</style>
