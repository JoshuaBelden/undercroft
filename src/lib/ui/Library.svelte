<script lang="ts">
	import { ITEMS, rarityOf } from '#lib/content/items.ts';
	import { LOOTABLES, type LootableId } from '#lib/content/lootables.ts';
	import { RECIPES } from '#lib/content/recipes.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { recipeStatus, recipesUsing } from '#lib/shared/items/crafting.ts';
	import Slot from './Slot.svelte';

	/**
	 * The Library (docs/dev/crafting.md#the-library): every item discovered, where it was seen
	 * and what it goes into; every recipe with any ingredient discovered, the rest shown as ?.
	 * A recipe with all of them is available: made in the Workshop (and below, if it is a field
	 * recipe).
	 */
	interface Props {
		explorer: ExplorerView;
		/** An item was looked at (no longer fresh). */
		onseen?: (item: string) => void;
	}

	let { explorer, onseen }: Props = $props();

	const discovered = $derived(new Set(Object.keys(explorer.discovered)));
	const items = $derived(
		Object.keys(explorer.discovered)
			.filter((id) => ITEMS[id])
			.sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name))
	);
	const recipes = $derived(
		RECIPES.map((recipe) => ({ recipe, status: recipeStatus(recipe, discovered) }))
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
</script>

<div class="library">
	<section class="panel" aria-labelledby="recipes-title">
		<h2 id="recipes-title">Recipes</h2>
		{#if recipes.length === 0}
			<p class="note">
				No recipe is known yet. Everything you see in a crate, a corpse or anything else you open
				below is discovered, and any recipe it goes into appears here.
			</p>
		{/if}
		<ul class="rows">
			{#each recipes as { recipe, status } (recipe.id)}
				{@const def = ITEMS[recipe.makes]}
				<li class="row">
					<span class="product" class:silhouette={status !== 'available'}>
						<Slot
							name={def?.name ?? recipe.makes}
							image={def?.image}
							count={recipe.count}
							rarity={status === 'available' ? rarityOf(recipe.makes) : undefined}
						/>
					</span>
					<div class="what">
						<strong>{def?.name ?? recipe.makes}{recipe.count > 1 ? ` ×${recipe.count}` : ''}</strong
						>
						<span class="needs">
							{#each recipe.ingredients as i (i.item)}
								{#if discovered.has(i.item)}
									<span>{ITEMS[i.item]?.name ?? i.item}{i.count > 1 ? ` ×${i.count}` : ''}</span>
								{:else}
									<span class="unknown" aria-label="Not discovered yet">?</span>
								{/if}
							{/each}
						</span>
						<span class="tag">
							{status === 'available'
								? recipe.field
									? 'Available: in the Workshop, or below with the field crafting kit'
									: 'Available in the Workshop'
								: 'Discover the rest to make it'}
						</span>
					</div>
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
				<li
					class="row"
					onpointerenter={() => {
						if (explorer.fresh.includes(id)) onseen?.(id);
					}}
				>
					<Slot
						name={def.name}
						image={def.image}
						rarity={rarityOf(id)}
						fresh={explorer.fresh.includes(id)}
					/>
					<div class="what">
						<strong>{def.name}</strong>
						<span class="flavor">{def.flavor}</span>
						<span class="needs">
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
		grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
		gap: 18px;
		width: min(1100px, 100%);
		margin: 24px auto 96px;
		padding: 0 16px;
	}

	.panel {
		padding: 18px 20px 20px;
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
		gap: 10px;
		--slot-size: 64px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.needs,
	.flavor,
	.tag {
		color: var(--muted);
	}

	.needs {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
	}

	.tag {
		font-size: 0.85em;
		font-style: italic;
	}

	.unknown {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 1px dashed var(--border);
		border-radius: 6px;
	}

	/* Not made yet: the product as a silhouette. */
	.silhouette :global(img) {
		filter: brightness(0) opacity(0.6);
	}

	.silhouette :global(.name) {
		opacity: 0.4;
	}

	.note {
		color: var(--muted);
	}
</style>
