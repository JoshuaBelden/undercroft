<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ITEMS } from '#lib/content/items.ts';
	import { LOOTABLES, type LootableId } from '#lib/content/lootables.ts';
	import { RECIPES } from '#lib/content/recipes.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { recipeStatus, recipesUsing } from '#lib/shared/items/crafting.ts';
	import IngredientSlots from './IngredientSlots.svelte';
	import TipSlot from './TipSlot.svelte';
	import { workshopAsk } from './workshop.svelte.ts';

	/**
	 * The Library (docs/dev/crafting.md#the-library): every recipe with any ingredient discovered,
	 * what it takes as slots (? for what isn't discovered yet), and every item discovered, where it
	 * was seen and what it goes into. A recipe that can be made opens it in the Workshop.
	 */
	interface Props {
		explorer: ExplorerView;
		/** An item was looked at (no longer fresh). */
		onseen?: (item: string) => void;
	}

	let { explorer, onseen }: Props = $props();

	const discovered = $derived(new Set(Object.keys(explorer.discovered)));
	const inStash = (item: string): number =>
		explorer.stash.reduce((n, stack) => n + (stack?.item === item ? stack.count : 0), 0);
	const items = $derived(
		Object.keys(explorer.discovered)
			.filter((id) => ITEMS[id])
			.sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name))
	);
	const recipes = $derived(
		RECIPES.filter((r) => !r.learned)
			.map((recipe) => ({ recipe, status: recipeStatus(recipe, discovered) }))
			.filter((r) => r.status !== 'hidden')
			.sort((a, b) => Number(b.status === 'available') - Number(a.status === 'available'))
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

	/** A recipe that can be made: off to the Workshop with it. */
	function make(id: string): void {
		workshopAsk.recipe = id;
		void goto(resolve('/(hub)/workshop'));
	}
</script>

<div class="library">
	<section class="panel" aria-labelledby="recipes-title">
		<h2 id="recipes-title">Recipes</h2>
		{#if recipes.length === 0}
			<p class="note">
				No recipe is known yet. Everything you see in a crate, a dead explorer or anything else you
				open below is discovered, and any recipe it goes into appears here.
			</p>
		{/if}
		<ul class="rows">
			{#each recipes as { recipe, status } (recipe.id)}
				{@const def = ITEMS[recipe.makes]}
				{@const ready = status === 'available'}
				<li class="row" class:ready>
					<span class="product" class:silhouette={!ready}>
						<TipSlot stack={{ item: recipe.makes, count: recipe.count }} />
					</span>
					<div class="what">
						<strong>{def?.name ?? recipe.makes}{recipe.count > 1 ? ` ×${recipe.count}` : ''}</strong
						>
						{#if ready}
							<span class="tag"
								>{recipe.field
									? 'In the Workshop, or below with the field crafting kit'
									: 'In the Workshop'}</span
							>
						{/if}
						<IngredientSlots
							ingredients={recipe.ingredients}
							have={inStash}
							known={(item) => discovered.has(item)}
						/>
					</div>
					{#if ready}
						<button type="button" class="pill go" onclick={() => make(recipe.id)}>Make</button>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

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
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(480px, 100%), 1fr));
		gap: 18px;
		width: min(1200px, 100%);
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

	/* Not made yet: the product as a silhouette. */
	.silhouette :global(img) {
		filter: brightness(0) opacity(0.6);
	}

	.silhouette :global(.name) {
		opacity: 0.4;
	}

	.pill {
		height: 40px;
		padding: 0 20px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-family: var(--font-ui);
	}

	.note {
		color: var(--muted);
	}
</style>
