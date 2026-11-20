<script lang="ts">
	import { ApiError, workshop } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { RECIPES } from '#lib/content/recipes.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { hasIngredients, recipeStatus, repairCost } from '#lib/shared/items/crafting.ts';
	import { condition } from '#lib/shared/items/durability.ts';
	import { getSlot } from '#lib/shared/items/inventory.ts';
	import type { SlotRef } from '#lib/shared/items/types.ts';
	import { GEAR_SLOTS, type ItemStack } from '#lib/shared/player/types.ts';
	import IngredientSlots from './IngredientSlots.svelte';
	import TipSlot from './TipSlot.svelte';

	/**
	 * The Workshop (docs/dev/crafting.md#the-workshop): make any available recipe from the stash,
	 * or mend what is worn (materials from the stash, and coin). Breaking things down is Salvage,
	 * in an item's menu on the Loadout page. Every change is the server's; the page shows the
	 * account it sends back.
	 */
	interface Props {
		explorer: ExplorerView;
		/** Ready or underground: nothing can be changed. */
		locked?: boolean;
		/** A slot to mend, chosen on the Loadout page (Repair in its menu). */
		preselect?: SlotRef | null;
		/** A recipe to make, chosen in the Library. */
		recipe?: string | null;
		/** Something was made or mended (for a sound). */
		onchange?: (kind: 'craft' | 'repair') => void;
	}

	let { explorer, locked = false, preselect = null, recipe = null, onchange }: Props = $props();

	let tab = $state<'craft' | 'repair'>('craft');
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

	function same(a: SlotRef | null, b: SlotRef): boolean {
		if (!a) return false;
		if (a.area === 'equipment' || b.area === 'equipment') {
			return a.area === 'equipment' && b.area === 'equipment' && a.slot === b.slot;
		}
		return a.area === b.area && a.index === b.index;
	}

	/** The recipe chosen in the Library is brought into view. */
	function chosen(id: string) {
		return (row: HTMLElement): void => {
			if (id === recipe) row.scrollIntoView({ block: 'center' });
		};
	}

	async function run(kind: 'craft' | 'repair', change: Parameters<typeof workshop>[0]) {
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
		{#each [['craft', 'Craft'], ['repair', 'Repair']] as [id, label] (id)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === id}
				class="pill"
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
				No recipe is known yet. Discover everything that goes into one, by finding it below, and it
				shows here.
			</p>
		{/if}
		<ul class="rows">
			{#each available as r (r.id)}
				{@const def = ITEMS[r.makes]}
				{@const n = times[r.id] ?? 1}
				{@const can = hasIngredients(r, inStash, n)}
				<li class="row" class:chosen={r.id === recipe} {@attach chosen(r.id)}>
					<TipSlot stack={{ item: r.makes, count: r.count * n }} />
					<div class="what">
						<strong>{def?.name ?? r.makes}{r.count > 1 ? ` ×${r.count}` : ''}</strong>
						{#if r.field}<span class="tag">Also below, with the field crafting kit</span>{/if}
						<IngredientSlots ingredients={r.ingredients} have={inStash} times={n} />
					</div>
					<div class="act">
						<label class="times">
							<span class="hidden">How many</span>
							<input
								type="number"
								min="1"
								max="20"
								value={n}
								oninput={(event) =>
									(times[r.id] = Math.max(1, Math.min(20, Number(event.currentTarget.value) || 1)))}
							/>
						</label>
						<button
							type="button"
							class="pill go"
							disabled={!can || busy || locked}
							onclick={() => void run('craft', { action: 'craft', recipe: r.id, times: n })}
							>Craft</button
						>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		{#if mendable.length === 0}<p class="note">Nothing you own needs mending.</p>{/if}
		<ul class="rows">
			{#each mendable as { ref, stack, where } (JSON.stringify(ref))}
				{@const def = ITEMS[stack.item]}
				{@const cost = repairCost(stack)!}
				{@const can =
					cost.materials.every((m) => inStash(m.item) >= m.count) && explorer.money >= cost.coin}
				<li class="row" class:chosen={same(preselect, ref)}>
					<TipSlot {stack} />
					<div class="what">
						<strong>{def?.name ?? stack.item}</strong>
						<span class="tag"
							>{where}, {Math.round((condition(stack) ?? 1) * 100)}% left{cost.coin > 0
								? `; and ${money(cost.coin)}`
								: ''}</span
						>
						<IngredientSlots ingredients={cost.materials} have={inStash} />
					</div>
					<div class="act">
						<button
							type="button"
							class="pill go"
							disabled={!can || busy || locked}
							onclick={() => void run('repair', { action: 'repair', at: ref })}>Repair</button
						>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.workshop {
		width: min(1100px, calc(100% - 32px));
		margin: 24px auto 96px;
		padding: 18px 24px 24px;
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
		gap: 8px;
		margin-bottom: 16px;
	}

	.pill {
		height: 40px;
		padding: 0 20px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: rgb(4 3 3 / 0.92);
		color: var(--text);
		font-family: var(--font-ui);
	}

	.pill.active {
		border-color: var(--accent);
		background: rgb(0 129 157 / 0.18);
	}

	.pill.go:not(:disabled) {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}

	.pill:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		--slot-size: 72px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 10px;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.02);
	}

	.row.chosen {
		outline: 1px solid var(--accent);
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

	.act {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.times input {
		width: 60px;
		height: 40px;
		padding: 0 10px;
		background: transparent;
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 999px;
		text-align: center;
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

	@media (max-width: 640px) {
		.row {
			flex-wrap: wrap;
		}
	}
</style>
