<script lang="ts">
	import { HELP_TOPICS } from '#lib/content/help/index.ts';
	import { bindingLabel, type Action } from '#lib/game/input/actions.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import Panel from './Panel.svelte';

	let { onclose }: { onclose: () => void } = $props();

	let selectedId = $state(HELP_TOPICS[0]?.id ?? null);
	const selected = $derived(HELP_TOPICS.find((topic) => topic.id === selectedId) ?? null);

	function render(body: string): string[] {
		return body
			.replace(/\{action:(\w+)\}/g, (_, action: string) => {
				const codes = settings.bindings[action as Action];
				return codes?.length ? codes.map(bindingLabel).join(' / ') : 'unbound';
			})
			.split(/\n\s*\n/);
	}
</script>

<Panel title="Help" {onclose}>
	{#if HELP_TOPICS.length === 0}
		<p class="muted">No help topics yet.</p>
	{:else}
		<div class="layout">
			<nav>
				{#each HELP_TOPICS as topic (topic.id)}
					<button
						type="button"
						class:active={topic.id === selectedId}
						onclick={() => (selectedId = topic.id)}>{topic.title}</button
					>
				{/each}
			</nav>
			{#if selected}
				<article>
					<h3>{selected.title}</h3>
					{#each render(selected.body) as paragraph, index (index)}
						<p>{paragraph}</p>
					{/each}
				</article>
			{/if}
		</div>
	{/if}
</Panel>

<style>
	.layout {
		display: grid;
		grid-template-columns: 180px 1fr;
		gap: 16px;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	nav button {
		text-align: left;
	}

	nav button.active {
		border-color: var(--accent);
	}

	h3 {
		margin-top: 0;
	}

	.muted {
		color: var(--muted);
	}
</style>
