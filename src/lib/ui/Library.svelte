<script lang="ts">
	import { ITEMS } from '#lib/content/items.ts';
	import { LOOTABLES, type LootableId } from '#lib/content/lootables.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { recipesUsing } from '#lib/shared/items/crafting.ts';
	import TipSlot from './TipSlot.svelte';

	/**
	 * The Library (docs/dev/crafting.md#the-library): every item discovered, where it was seen and
	 * how many recipes it goes into, with the item tooltip. The recipes are the Workshop's.
	 */
	interface Props {
		explorer: ExplorerView;
		/** An item was looked at (no longer fresh). */
		onseen?: (item: string) => void;
	}

	let { explorer, onseen }: Props = $props();

	const items = $derived(
		Object.keys(explorer.discovered)
			.filter((id) => ITEMS[id])
			.sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name))
	);

	/** Where something was seen, in words: "a crate, a dead explorer". */
	function seenIn(item: string): string {
		const where = (explorer.discovered[item] ?? []).map((source) =>
			source === 'fragment'
				? 'a recipe fragment'
				: (LOOTABLES[source as LootableId]?.name.toLowerCase() ?? source)
		);
		return where.join(', ');
	}
</script>

<div class="library">
	<section class="panel" aria-labelledby="found-title">
		<h2 id="found-title">Discovered</h2>
		{#if items.length === 0}<p class="note">Nothing yet.</p>{/if}
		<ul class="rows">
			{#each items as id (id)}
				{@const def = ITEMS[id]}
				{@const uses = recipesUsing(id).length}
				<li class="row">
					<TipSlot
						stack={{ item: id, count: 1 }}
						fresh={explorer.fresh.includes(id)}
						onpoint={() => {
							if (explorer.fresh.includes(id)) onseen?.(id);
						}}
					/>
					<div class="what">
						<strong>{def.name}</strong>
						<span class="tag">
							Seen in {seenIn(id)}. {uses === 0
								? 'Used in no recipe.'
								: `Used in ${uses} recipe${uses === 1 ? '' : 's'}.`}
						</span>
					</div>
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.library {
		width: min(1200px, 100%);
		box-sizing: border-box;
		margin: 24px auto 84px;
		padding: 0 16px;
	}

	/* As tall as the window allows (less the bar above and the corner buttons below), like the
	   Loadout page's panels. */
	.panel {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		height: calc(100vh - 170px);
		padding: 18px 24px 24px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.55);
		backdrop-filter: blur(6px);
		min-width: 0;
	}

	h2 {
		margin: 0 0 12px;
		font-family: var(--font-display);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		--slot-size: 72px;
		/* The page stays still: the list scrolls inside its container. */
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-right: 6px;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 10px;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.02);
	}

	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tag {
		color: var(--muted);
		font-size: 0.85em;
		font-style: italic;
	}

	.note {
		color: var(--muted);
	}
</style>
