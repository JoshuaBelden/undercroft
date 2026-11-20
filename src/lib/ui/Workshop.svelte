<script lang="ts">
	import { ApiError, workshop } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import { ITEMS, rarityOf } from '#lib/content/items.ts';
	import { RECIPES, type Ingredient } from '#lib/content/recipes.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import {
		hasIngredients,
		recipeStatus,
		repairCost,
		salvageOf
	} from '#lib/shared/items/crafting.ts';
	import { condition, isBroken } from '#lib/shared/items/durability.ts';
	import { getSlot } from '#lib/shared/items/inventory.ts';
	import type { SlotRef } from '#lib/shared/items/types.ts';
	import { GEAR_SLOTS, type ItemStack } from '#lib/shared/player/types.ts';
	import Slot from './Slot.svelte';

	/**
	 * The Workshop (docs/dev/crafting.md#the-workshop): make any available recipe from the stash,
	 * mend what is worn (materials from the stash, and coin), or break something down into its
	 * materials. Every change is the server's; the page shows the account it sends back.
	 */
	interface Props {
		explorer: ExplorerView;
		/** Ready or underground: nothing can be changed. */
		locked?: boolean;
		/** A slot to mend, chosen on the Loadout page (Repair in its menu). */
		preselect?: SlotRef | null;
		/** Something was made, mended or broken down (for a sound). */
		onchange?: (kind: 'craft' | 'repair' | 'salvage') => void;
	}

	let { explorer, locked = false, preselect = null, onchange }: Props = $props();

	let tab = $state<'craft' | 'repair' | 'salvage'>('craft');
	let error = $state('');
	let busy = $state(false);
	let times = $state<Record<string, number>>({});

	$effect(() => {
		if (preselect) tab = 'repair';
	});

	const discovered = $derived(new Set(Object.keys(explorer.discovered)));
	const inStash = (item: string): number =>
		explorer.stash.reduce((n, stack) => n + (stack?.item === item ? stack.count : 0), 0);

	/** Every recipe that can be made: every ingredient discovered. */
	const available = $derived(RECIPES.filter((r) => recipeStatus(r, discovered) === 'available'));

	/** Every slot of the stash and loadout with something in it. */
	const owned = $derived.by(() => {
		const out: { ref: SlotRef; stack: ItemStack; where: string }[] = [];
		const b = { inventory: explorer.loadout, stash: explorer.stash };
		const refs: { ref: SlotRef; where: string }[] = [
			...explorer.stash.map((_, index) => ({
				ref: { area: 'stash', index } as SlotRef,
				where: 'Stash'
			})),
			...(['primary', 'secondary', 'defense', ...GEAR_SLOTS] as const).map((slot) => ({
				ref: { area: 'equipment', slot } as SlotRef,
				where: 'Loadout'
			})),
			...explorer.loadout.quick.map((_, index) => ({
				ref: { area: 'quick', index } as SlotRef,
				where: 'Loadout'
			})),
			...explorer.loadout.backpack.map((_, index) => ({
				ref: { area: 'backpack', index } as SlotRef,
				where: 'Loadout'
			}))
		];
		for (const { ref, where } of refs) {
			const stack = getSlot(b, ref);
			if (stack) out.push({ ref, stack, where });
		}
		return out;
	});
	const mendable = $derived(owned.filter(({ stack }) => repairCost(stack)));
	const salvageable = $derived(
		owned.filter(({ stack }) => !ITEMS[stack.item]?.treasure && salvageOf(stack).length > 0)
	);

	function same(a: SlotRef | null, b: SlotRef): boolean {
		if (!a) return false;
		if (a.area === 'equipment' || b.area === 'equipment') {
			return a.area === 'equipment' && b.area === 'equipment' && a.slot === b.slot;
		}
		return a.area === b.area && a.index === b.index;
	}

	function ingredients(list: Ingredient[]): string {
		return list
			.map((i) => `${ITEMS[i.item]?.name ?? i.item}${i.count > 1 ? ` ×${i.count}` : ''}`)
			.join(', ');
	}

	async function run(
		kind: 'craft' | 'repair' | 'salvage',
		change: Parameters<typeof workshop>[0]
	): Promise<void> {
		if (busy || locked) return;
		busy = true;
		error = '';
		try {
			await workshop(change);
			onchange?.(kind);
		} catch (failed) {
			error = failed instanceof ApiError ? failed.message : 'Something went wrong. Try again';
		} finally {
			busy = false;
		}
	}
</script>

<section class="workshop" aria-labelledby="workshop-title">
	<h2 id="workshop-title">Workshop</h2>
	<div class="tabs" role="tablist">
		{#each [['craft', 'Craft'], ['repair', 'Repair'], ['salvage', 'Salvage']] as [id, label] (id)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === id}
				class:active={tab === id}
				onclick={() => (tab = id as typeof tab)}>{label}</button
			>
		{/each}
	</div>
	{#if locked}
		<p class="note">You can't use the Workshop while you're ready to descend or underground.</p>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if tab === 'craft'}
		{#if available.length === 0}
			<p class="note">
				No recipe is known yet. Discover what goes into one, by finding it below, and it shows here.
			</p>
		{/if}
		<ul class="rows">
			{#each available as recipe (recipe.id)}
				{@const def = ITEMS[recipe.makes]}
				{@const n = times[recipe.id] ?? 1}
				{@const can = hasIngredients(recipe, inStash, n)}
				<li class="row">
					<Slot
						name={def?.name ?? recipe.makes}
						image={def?.image}
						count={recipe.count}
						rarity={rarityOf(recipe.makes)}
					/>
					<div class="what">
						<strong>{def?.name ?? recipe.makes}{recipe.count > 1 ? ` ×${recipe.count}` : ''}</strong
						>
						<span class="needs">
							{#each recipe.ingredients as i (i.item)}
								<span class:short={inStash(i.item) < i.count * n}>
									{ITEMS[i.item]?.name ?? i.item}
									{inStash(i.item)}/{i.count * n}
								</span>
							{/each}
						</span>
						{#if recipe.field}<span class="tag">Also in the field</span>{/if}
					</div>
					<label class="times">
						<span class="hidden">How many</span>
						<input
							type="number"
							min="1"
							max="20"
							value={n}
							oninput={(event) =>
								(times[recipe.id] = Math.max(
									1,
									Math.min(20, Number(event.currentTarget.value) || 1)
								))}
						/>
					</label>
					<button
						type="button"
						class="primary"
						disabled={!can || busy || locked}
						onclick={() => void run('craft', { action: 'craft', recipe: recipe.id, times: n })}
						>Craft</button
					>
				</li>
			{/each}
		</ul>
	{:else if tab === 'repair'}
		{#if mendable.length === 0}<p class="note">Nothing you own needs mending.</p>{/if}
		<ul class="rows">
			{#each mendable as { ref, stack, where } (JSON.stringify(ref))}
				{@const def = ITEMS[stack.item]}
				{@const cost = repairCost(stack)!}
				{@const can =
					cost.materials.every((m) => inStash(m.item) >= m.count) && explorer.money >= cost.coin}
				<li class="row" class:chosen={same(preselect, ref)}>
					<Slot
						name={def?.name ?? stack.item}
						image={def?.image}
						rarity={rarityOf(stack.item)}
						broken={isBroken(stack)}
					/>
					<div class="what">
						<strong>{def?.name ?? stack.item}</strong>
						<span class="needs">
							{where}, {Math.round((condition(stack) ?? 1) * 100)}% left. Takes {ingredients(
								cost.materials
							)}{cost.coin > 0 ? ` and ${money(cost.coin)}` : ''}.
						</span>
					</div>
					<button
						type="button"
						class="primary"
						disabled={!can || busy || locked}
						onclick={() => void run('repair', { action: 'repair', at: ref })}>Repair</button
					>
				</li>
			{/each}
		</ul>
	{:else}
		{#if salvageable.length === 0}<p class="note">
				Nothing you own breaks down into anything.
			</p>{/if}
		<ul class="rows">
			{#each salvageable as { ref, stack, where } (JSON.stringify(ref))}
				{@const def = ITEMS[stack.item]}
				<li class="row">
					<Slot
						name={def?.name ?? stack.item}
						image={def?.image}
						count={stack.count}
						rarity={rarityOf(stack.item)}
						broken={isBroken(stack)}
					/>
					<div class="what">
						<strong>{def?.name ?? stack.item}</strong>
						<span class="needs">{where}. Gives {ingredients(salvageOf(stack))}.</span>
					</div>
					<button
						type="button"
						disabled={busy || locked}
						onclick={() => void run('salvage', { action: 'salvage', at: ref })}>Salvage</button
					>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.workshop {
		width: min(820px, 100%);
		margin: 24px auto 96px;
		padding: 18px 20px 20px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.55);
		backdrop-filter: blur(6px);
	}

	h2 {
		margin: 0 0 12px;
		font-family: var(--font-display);
	}

	.tabs {
		display: flex;
		gap: 6px;
		margin-bottom: 14px;
	}

	.tabs button {
		border-radius: 999px;
	}

	.tabs button.active {
		border-color: var(--accent);
		background: rgb(0 129 157 / 0.18);
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
		padding: 8px;
		border-radius: 12px;
	}

	.row.chosen {
		outline: 1px solid var(--accent);
	}

	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.needs {
		color: var(--muted);
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
	}

	.short {
		color: var(--broken);
	}

	.tag {
		color: var(--muted);
		font-size: 0.85em;
		font-style: italic;
	}

	.times input {
		width: 56px;
		padding: 6px;
		background: transparent;
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	button.primary {
		border-color: var(--accent);
	}

	button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.note {
		color: var(--muted);
	}

	.error {
		color: var(--broken);
	}

	.hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	@media (max-width: 560px) {
		.row {
			flex-wrap: wrap;
		}
	}
</style>
