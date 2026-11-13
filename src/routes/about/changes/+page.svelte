<script lang="ts">
	import { RELEASES } from '#lib/content/changelog.ts';
	import InlineText from '#lib/ui/InlineText.svelte';
</script>

<svelte:head>
	<title>What's new · Undercroft</title>
</svelte:head>

<h1>What's new</h1>

{#each RELEASES as release (release.version ?? 'unreleased')}
	<section class="release">
		<h2>
			{release.version ? `Version ${release.version}` : 'In this build'}
			{#if release.date}<span class="date">{release.date}</span>{/if}
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
{/each}

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
</style>
