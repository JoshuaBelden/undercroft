<script lang="ts">
	import { HELP_CATEGORIES, HELP_TOPICS, type HelpCategory } from '#lib/content/help/index.ts';
	import type { Action } from '#lib/game/input/actions.ts';
	import { promptCodes } from '#lib/game/input/device.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import KeyCap from './KeyCap.svelte';
	import TabScreen from './TabScreen.svelte';

	/**
	 * The help screen: a full-window TabScreen (like the settings) with a tab per help section,
	 * each showing its articles one after another. The dashboard and the game view open it
	 * (`dim` over the catacombs). Content is src/lib/content/help/index.ts.
	 */
	interface Props {
		onclose: () => void;
		/** Darken what is behind (the game view). */
		dim?: boolean;
	}

	let { onclose, dim = false }: Props = $props();

	const sections = HELP_CATEGORIES.filter((category) =>
		HELP_TOPICS.some((topic) => topic.category === category)
	);
	let section = $state<HelpCategory>(sections[0] ?? 'Getting started');
	const topics = $derived(HELP_TOPICS.filter((topic) => topic.category === section));

	/** A run of text, or bindings shown as key caps (or controller buttons), by code. */
	type Part = { text: string } | { keys: string[] };
	type Block = { list: false; parts: Part[] } | { list: true; items: Part[][] };

	/** The bindings a token shows: `{action:name}` the device in use's, `{pad:name}` the controller's. */
	function codes(kind: string, name: string): readonly string[] {
		if (kind === 'pad') return settings.padBindings[name as Action] ?? [];
		return promptCodes(name as Action);
	}

	function parts(line: string): Part[] {
		const out: Part[] = [];
		let last = 0;
		for (const match of line.matchAll(/\{(action|pad):(\w+)\}/g)) {
			if (match.index > last) out.push({ text: line.slice(last, match.index) });
			const shown = codes(match[1] ?? '', match[2] ?? '');
			out.push(shown.length ? { keys: [...shown] } : { text: 'unbound' });
			last = match.index + match[0].length;
		}
		if (last < line.length) out.push({ text: line.slice(last) });
		return out;
	}

	/** Paragraphs split on blank lines; a paragraph of "- " lines is a list. */
	function blocks(body: string): Block[] {
		return body.split(/\n\s*\n/).map((paragraph) => {
			const lines = paragraph.trim().split('\n');
			if (lines.every((line) => line.trimStart().startsWith('- '))) {
				return { list: true, items: lines.map((line) => parts(line.trimStart().slice(2))) };
			}
			return { list: false, parts: parts(paragraph.trim()) };
		});
	}
</script>

{#snippet line(content: Part[])}
	{#each content as part, i (i)}
		{#if 'keys' in part}
			{#each part.keys as key, k (k)}{#if k > 0}<span class="or">/</span>{/if}<KeyCap
					code={key}
					size="large"
				/>{/each}
		{:else}{part.text}{/if}
	{/each}
{/snippet}

<!-- Solid behind the text: the dashboard or the catacombs would make it hard to read. -->
<TabScreen label="Help" groups={sections} bind:group={section} {onclose} {dim} solid>
	<div class="articles">
		{#each topics as topic (topic.id)}
			<article>
				<h2>{topic.title}</h2>
				{#each blocks(topic.body) as block, b (b)}
					{#if block.list}
						<ul>
							{#each block.items as item, j (j)}
								<li>{@render line(item)}</li>
							{/each}
						</ul>
					{:else}
						<p>{@render line(block.parts)}</p>
					{/if}
				{/each}
			</article>
		{/each}
	</div>
</TabScreen>

<style>
	/* Plain text on the game's dark backdrop: a readable column, no panels. */
	.articles {
		display: flex;
		flex-direction: column;
		gap: 36px;
		max-width: 68ch;
	}

	h2 {
		margin: 0 0 10px;
		font-size: 1.5rem;
		letter-spacing: 0.04em;
		color: var(--text);
	}

	p,
	li {
		font-size: 1.05rem;
		line-height: 1.65;
		color: var(--text);
	}

	p {
		margin: 0 0 12px;
	}

	ul {
		margin: 0 0 12px;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 8px;
	}

	li {
		line-height: 1.4;
	}

	/* Key caps sit in the line of text, with a little room either side. */
	p :global(.key),
	li :global(.key) {
		margin: 0 2px;
		vertical-align: -0.25em;
	}

	.or {
		margin: 0 2px;
		color: var(--muted);
	}
</style>
