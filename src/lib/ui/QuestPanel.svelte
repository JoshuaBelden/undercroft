<script lang="ts">
	import { trackedQuest } from '#lib/shared/quests/engine.ts';
	import type { QuestBrief } from '#lib/shared/quests/types.ts';

	/**
	 * Your open quests while underground (docs/dev/quests.md), under the rite panel: each one's
	 * title and what is still to do, ticked off as it is done. A few at a time: the tracked one
	 * first (a yellow dot), then those with something left to do below. Nothing in it can be
	 * clicked. Shown and hidden with the rite panel (its setting and binding).
	 */
	interface Props {
		quests: QuestBrief[];
		/** The quest the player chose to follow (settings), if still open. */
		chosen?: string | null;
		/** How many to show at once. */
		max?: number;
	}

	let { quests, chosen = null, max = 3 }: Props = $props();

	const tracked = $derived(
		trackedQuest(
			quests.map((q) => q.id),
			chosen
		)
	);
	/**
	 * The tracked one first; then something still to do below; then those only waiting to be
	 * brought back or reported.
	 */
	const ordered = $derived(
		[...quests].sort(
			(a, b) =>
				Number(b.id === tracked) - Number(a.id === tracked) ||
				Number(left(b) > 0) - Number(left(a) > 0)
		)
	);
	const shown = $derived(ordered.slice(0, max));

	function left(quest: QuestBrief): number {
		return quest.objectives.filter((o) => o.count < o.of).length;
	}
</script>

{#if quests.length}
	<section class="quests" aria-label="Quests">
		<h2><span class="pill">Quests</span></h2>
		<ol>
			{#each shown as quest (quest.id)}
				<li>
					<span class="title"
						>{#if quest.id === tracked}<span class="tracked" role="img" aria-label="Tracked"
							></span>{/if}{quest.title}</span
					>
					<ul>
						{#each quest.objectives as objective, i (i)}
							<li class:met={objective.count >= objective.of}>
								{objective.text}{#if objective.of > 1}
									<span class="count">{objective.count}/{objective.of}</span>{/if}
							</li>
						{/each}
						{#if left(quest) === 0}
							<li class="back">
								{quest.bring.length ? 'Bring it back to commit' : 'Report back on the surface'}
							</li>
						{/if}
					</ul>
				</li>
			{/each}
		</ol>
		{#if quests.length > shown.length}
			<p class="more">and {quests.length - shown.length} more</p>
		{/if}
	</section>
{/if}

<style>
	.quests {
		width: min(280px, 100%);
		margin-top: 16px;
		font: 13px var(--font-ui);
		color: var(--text);
		text-shadow: 0 0 6px rgb(0 0 0 / 0.9);
	}

	h2 {
		margin: 0 0 8px;
	}

	.pill {
		display: inline-block;
		padding: 3px 12px;
		border: 1px solid rgb(226 220 204 / 0.4);
		border-radius: 999px;
		font: 400 0.85rem var(--font-lore);
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	ol,
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	ol > li {
		margin-bottom: 8px;
	}

	.title {
		font-weight: 600;
	}

	/* The tracked quest: a yellow dot before its title, as on the contact's page. */
	.tracked {
		display: inline-block;
		width: 7px;
		height: 7px;
		margin-right: 6px;
		border-radius: 50%;
		background: var(--launch-bright);
		box-shadow: 0 0 6px var(--launch-bright);
		vertical-align: middle;
	}

	ul li {
		padding-left: 12px;
		color: rgb(226 220 204 / 0.85);
	}

	ul li.met {
		color: rgb(226 220 204 / 0.45);
		text-decoration: line-through;
	}

	.back {
		color: var(--launch-bright);
	}

	.count {
		margin-left: 6px;
		opacity: 0.7;
	}

	.more {
		margin: 0;
		opacity: 0.6;
	}
</style>
