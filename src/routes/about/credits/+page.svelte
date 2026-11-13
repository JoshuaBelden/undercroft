<script lang="ts">
	import {
		AI_STATEMENT,
		AI_TOOLS,
		CREATOR,
		CREDIT_SECTIONS,
		SOURCE_URL,
		type Credit
	} from '#lib/content/credits.ts';
	import { devMode } from '#lib/dev.ts';

	/** Placeholders only show in dev mode, marked, so the owner sees what is left to fill in. */
	const shown = (entries: Credit[]) => entries.filter((entry) => devMode || !entry.todo);
	const sections = CREDIT_SECTIONS.map((section) => ({
		...section,
		entries: shown(section.entries)
	})).filter((section) => section.entries.length > 0);
</script>

<svelte:head>
	<title>Credits · Undercroft</title>
</svelte:head>

{#snippet list(entries: Credit[])}
	<ul>
		{#each entries as entry, i (i)}
			<li class:todo={entry.todo}>
				<span class="name">
					{#if entry.url}<a href={entry.url} rel="external">{entry.name}</a>{:else}{entry.name}{/if}
				</span>
				{#if entry.detail}<span class="detail">{entry.detail}</span>{/if}
				{#if entry.license}<span class="license">{entry.license}</span>{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<h1>Credits</h1>
<p class="lead">Undercroft is made by <strong>{CREATOR}</strong>.</p>

<section>
	<h2>On the use of AI</h2>
	{#each AI_STATEMENT as paragraph, i (i)}
		<p>{paragraph}</p>
	{/each}
	{@render list(shown(AI_TOOLS))}
</section>

{#each sections as section (section.id)}
	<section>
		<h2>{section.title}</h2>
		{#if section.intro}<p>{section.intro}</p>{/if}
		{@render list(section.entries)}
	</section>
{/each}

<section>
	<h2>License</h2>
	<p>
		The code is free software under the GNU Affero General Public License 3.0. The art, models,
		sound, writing and the Undercroft name are not: all rights reserved.
		{#if SOURCE_URL}<a href={SOURCE_URL} rel="external">Source code</a>.{/if}
	</p>
</section>

<style>
	h1 {
		margin: 0 0 8px;
		font-size: 2rem;
	}

	.lead {
		margin: 0 0 24px;
	}

	section {
		margin-bottom: 24px;
		padding: 20px 24px;
		background: rgb(20 17 15 / 0.9);
		border: 1px solid var(--border);
	}

	h2 {
		margin: 0 0 10px;
		font-size: 1.3rem;
	}

	p {
		margin: 8px 0;
		line-height: 1.55;
	}

	ul {
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 8px;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
	}

	.name {
		font-weight: 600;
	}

	.detail {
		color: var(--muted);
	}

	.license {
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--muted);
		font-family: var(--font-ui);
		font-size: 0.75rem;
	}

	/* A placeholder, shown in dev mode only. */
	.todo {
		color: #e3b92c;
	}

	.todo .detail {
		color: inherit;
		opacity: 0.7;
	}

	a {
		color: var(--text);
	}
</style>
