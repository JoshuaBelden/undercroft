<script lang="ts">
	import { SOURCE_URL } from '#lib/content/credits.ts';
	import { RELEASE as release } from '#lib/content/release.ts';
	import InlineText from '#lib/ui/InlineText.svelte';

	/** Every earlier release's notes are on GitHub, with its tag. */
	const releasesUrl = SOURCE_URL ? `${SOURCE_URL}/releases` : null;
</script>

<svelte:head>
	<title>What's new · Undercroft</title>
</svelte:head>

<h1>What's new</h1>

<section class="release">
	<h2>
		Version {release.version}
		<span class="date">{release.date}</span>
	</h2>
	{#each release.blocks as block, i (i)}
		{#if block.kind === 'heading'}
			<h3>{block.text}</h3>
		{:else if block.kind === 'paragraph'}
			<p><InlineText parts={block.parts} /></p>
		{:else}
			<ul>
				{#each block.items as item, j (j)}
					<li><InlineText parts={item} /></li>
				{/each}
			</ul>
		{/if}
	{/each}
</section>

{#if releasesUrl}
	<p class="older">Earlier versions: <a href={releasesUrl} rel="external">release notes</a></p>
{/if}

<style>
	h1 {
		margin: 0 0 24px;
		font-size: 2rem;
	}

	.release {
		margin-bottom: 28px;
		padding: 20px 24px;
		background: rgb(20 17 15 / 0.9);
		border: 1px solid var(--border);
	}

	h2 {
		display: flex;
		align-items: baseline;
		gap: 14px;
		margin: 0 0 8px;
		font-size: 1.4rem;
	}

	.date {
		color: var(--muted);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: normal;
	}

	h3 {
		margin: 18px 0 6px;
		font-size: 0.95rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	p,
	ul {
		margin: 6px 0;
		line-height: 1.5;
	}

	ul {
		padding-left: 20px;
	}

	li + li {
		margin-top: 4px;
	}

	.older {
		color: var(--muted);
		font-family: var(--font-ui);
		font-size: 0.9rem;
	}
</style>
