<script lang="ts">
	import { ITEMS, rarityOf } from '#lib/content/items.ts';
	import { CRAFT, RECIPES, REPAIRS } from '#lib/content/recipes.ts';
	import { hasIngredients, recipeStatus } from '#lib/shared/items/crafting.ts';
	import { condition, lasting, wearOf } from '#lib/shared/items/durability.ts';
	import { wornGear } from '#lib/shared/items/gear.ts';
	import { carriedCount, getSlot } from '#lib/shared/items/inventory.ts';
	import type { SlotRef } from '#lib/shared/items/types.ts';
	import { GEAR_SLOTS, type Inventory } from '#lib/shared/player/types.ts';
	import Slot from './Slot.svelte';

	/**
	 * The in-game menu's Craft tab (docs/dev/crafting.md#field-crafting): with the field crafting kit
	 * worn, the field recipes they can make from what they carry, and what they could mend a little.
	 * Choosing one kneels them over it; moving, or the dark, stops it.
	 */
	interface Props {
		inventory: Inventory;
		discovered: ReadonlySet<string>;
		/** Recipes quests have taught (docs/dev/quests.md): made below only, never in the Library. */
		learned?: readonly string[];
		oncraft: (change: { recipe: string } | { repair: SlotRef }) => void;
	}

	let { inventory, discovered, learned = [], oncraft }: Props = $props();

	const kit = $derived(wornGear(inventory).some((def) => def.crafting));
	const count = (item: string): number => carriedCount(inventory, item);
	const recipes = $derived(
		RECIPES.filter((r) => r.field && recipeStatus(r, discovered, learned) === 'available')
	);

	/** Carried things worn enough to mend, with their materials. */
	const mendable = $derived.by(() => {
		const refs: SlotRef[] = [
			...(['primary', 'secondary', 'defense', ...GEAR_SLOTS] as const).map(
				(slot) => ({ area: 'equipment', slot }) as SlotRef
			),
			...inventory.quick.map((_, index) => ({ area: 'quick', index }) as SlotRef),
			...inventory.backpack.map((_, index) => ({ area: 'backpack', index }) as SlotRef)
		];
		return refs.flatMap((ref) => {
			const stack = getSlot({ inventory }, ref);
			const def = stack ? ITEMS[stack.item] : undefined;
			const last = lasting(def);
			if (!stack || !def || !REPAIRS[stack.item] || !last || last.usedUp || def.crafting) return [];
			if (wearOf(stack) <= 0) return [];
			return [{ ref, stack, can: REPAIRS[stack.item].every((m) => count(m.item) >= m.count) }];
		});
	});
</script>

<div class="craft">
	{#if !kit}
		<p class="note">Wear the field crafting kit, in a gear slot, to make things down here.</p>
	{:else}
		<p class="note">
			Kneel and work for a few seconds, in the light of your lamp. It makes a little noise, and
			moving stops it.
		</p>
		<h3>Make</h3>
		{#if recipes.length === 0}<p class="note">No field recipe is known yet.</p>{/if}
		<ul class="rows">
			{#each recipes as recipe (recipe.id)}
				{@const def = ITEMS[recipe.makes]}
				{@const can = hasIngredients(recipe, count)}
				<li class="row">
					<Slot
						name={def?.name ?? recipe.makes}
						image={def?.image}
						count={recipe.count}
						rarity={rarityOf(recipe.makes)}
					/>
					<div class="what">
						<strong>{def?.name ?? recipe.makes}</strong>
						<span class="needs">
							{#each recipe.ingredients as i (i.item)}
								<span class:short={count(i.item) < i.count}
									>{ITEMS[i.item]?.name ?? i.item} {count(i.item)}/{i.count}</span
								>
							{/each}
						</span>
					</div>
					<button type="button" disabled={!can} onclick={() => oncraft({ recipe: recipe.id })}
						>Make</button
					>
				</li>
			{/each}
		</ul>
		<h3>Mend</h3>
		{#if mendable.length === 0}<p class="note">Nothing you carry needs it.</p>{/if}
		<ul class="rows">
			{#each mendable as { ref, stack, can } (JSON.stringify(ref))}
				{@const def = ITEMS[stack.item]}
				<li class="row">
					<Slot name={def?.name ?? stack.item} image={def?.image} rarity={rarityOf(stack.item)} />
					<div class="what">
						<strong>{def?.name ?? stack.item}</strong>
						<span class="needs">
							{Math.round((condition(stack) ?? 1) * 100)}% left; gives back {Math.round(
								CRAFT.fieldRepair * 100
							)}%. Takes
							{REPAIRS[stack.item]
								.map((m) => `${ITEMS[m.item]?.name ?? m.item}${m.count > 1 ? ` ×${m.count}` : ''}`)
								.join(', ')}.
						</span>
					</div>
					<button type="button" disabled={!can} onclick={() => oncraft({ repair: ref })}
						>Mend</button
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.craft {
		display: flex;
		flex-direction: column;
		gap: 8px;
		--slot-size: 56px;
	}

	h3 {
		margin: 8px 0 0;
		font-family: var(--font-display);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.needs,
	.note {
		color: var(--muted);
	}

	.needs {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 10px;
	}

	.short {
		color: var(--broken);
	}

	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
</style>
