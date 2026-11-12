<script lang="ts">
	import { money, sellPrice } from '#lib/content/economy.ts';
	import { BACKDROP_IMAGE } from '#lib/content/images.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import type { ExpeditionSummary } from '#lib/shared/protocol.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import { slotMark, stackDetail } from './items.ts';
	import { parallax } from './parallax.ts';
	import Slot from './Slot.svelte';

	interface Props {
		summary: ExpeditionSummary;
		/** The Affliction the expedition went down against (empty if not known). */
		affliction: string;
		/** How the expedition ended for this player. */
		outcome: 'extracted' | 'died' | 'lost' | 'abandoned' | 'banished' | 'resolved';
		/** After watching the rest of the expedition: how many of the others got out alive. */
		escaped?: number | null;
		/** What was carried out (kept); null when it was lost. */
		carried: ItemStack[] | null;
		/** Back to the surface, on the loadout. */
		oncontinue: () => void;
	}

	let { summary, affliction, outcome, escaped = null, carried, oncontinue }: Props = $props();

	const TITLES = {
		extracted: 'You made it out',
		died: "You didn't make it out",
		lost: 'Lost in the dark',
		abandoned: 'You abandoned the expedition',
		banished: 'The dark recedes',
		resolved: 'The rite is done'
	};

	const note = $derived(
		outcome === 'banished'
			? `You drove it back, for now. ${affliction || 'The Affliction'} is not resolved.`
			: outcome === 'resolved'
				? `${affliction || 'The Affliction'} is resolved, and you made it out. The dark lets go of this place.`
				: outcome === 'lost'
					? 'Time ran out with you still underground. What you carried stays down there.'
					: escaped !== null
						? escaped === 0
							? 'No one made it out.'
							: `${escaped} of the others made it out.`
						: null
	);

	const time = $derived(
		`${Math.floor(summary.seconds / 60)}:${String(summary.seconds % 60).padStart(2, '0')}`
	);
	const stats = $derived([
		{ label: 'Time underground', value: time },
		{ label: 'Deepest level', value: String(summary.deepestLevel + 1) },
		{ label: 'Creatures killed', value: String(summary.kills) },
		{ label: 'Crates opened', value: String(summary.crates) },
		{ label: 'Hints found', value: String(summary.clues) }
	]);
	/** What the haul would fetch if all of it were sold. */
	const worth = $derived(
		(carried ?? []).reduce((sum, stack) => sum + sellPrice(stack.item) * stack.count, 0)
	);
</script>

<!-- The whole window, like the screens on the surface: the expedition is over. -->
<main class="screen backdrop-art" style:--backdrop-image={BACKDROP_IMAGE} use:parallax>
	<section class="recap" aria-labelledby="recap-title">
		<p class="kicker">{affliction ? `${affliction} · ` : ''}Expedition over</p>
		<h1 id="recap-title">{TITLES[outcome]}</h1>
		{#if note}
			<p class="note">{note}</p>
		{/if}

		<dl class="stats">
			{#each stats as stat (stat.label)}
				<div class="stat">
					<dt>{stat.label}</dt>
					<dd>{stat.value}</dd>
				</div>
			{/each}
		</dl>

		<div class="haul">
			<h2>Brought out</h2>
			{#if carried === null}
				<p class="empty">Everything you carried is lost.</p>
			{:else if carried.length === 0}
				<p class="empty">Nothing.</p>
			{:else}
				<div class="slots">
					{#each carried as stack, i (i)}
						{@const def = ITEMS[stack.item]}
						<Slot
							name={def?.name ?? stack.item}
							count={stack.count}
							image={def?.image}
							detail={stackDetail(stack)}
							rarity={def?.rarity}
							quest={def?.quest}
							mark={slotMark(stack.item)}
						/>
					{/each}
				</div>
				{#if worth > 0}
					<p class="worth">Worth {money(worth)}</p>
				{/if}
			{/if}
		</div>

		<button type="button" class="pill" onclick={oncontinue}>Continue</button>
	</section>
</main>

<style>
	.screen {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		overflow-y: auto;
		/* Out of the black the extraction faded to. */
		animation: appear 0.8s ease-out;
	}

	@keyframes appear {
		from {
			opacity: 0;
		}
	}

	.recap {
		width: min(640px, 100%);
		display: grid;
		justify-items: center;
		gap: 24px;
		padding: 36px 32px 32px;
		background: rgb(20 17 15 / 0.88);
		border: 1px solid var(--border);
		text-align: center;
	}

	.kicker {
		margin: 0 0 -16px;
		font: 600 0.8rem var(--font-ui);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--muted);
	}

	h1 {
		margin: 0;
		font: 400 clamp(1.5rem, 4vw, 2.2rem) var(--font-lore);
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.note {
		margin: -12px 0 0;
		font: italic 1rem var(--font-lore);
		color: var(--muted);
	}

	.stats {
		width: 100%;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
		gap: 8px;
	}

	.stat {
		display: flex;
		flex-direction: column-reverse;
		gap: 4px;
		padding: 12px 8px;
		border: 1px solid var(--border);
		background: rgb(10 9 8 / 0.6);
	}

	dt {
		font: 0.72rem var(--font-ui);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	dd {
		margin: 0;
		font: 700 1.8rem var(--font-display);
		font-variant-numeric: tabular-nums;
	}

	.haul {
		width: 100%;
		display: grid;
		justify-items: center;
		gap: 12px;
	}

	h2 {
		margin: 0;
		font: 600 0.8rem var(--font-ui);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.slots {
		--slot-size: 72px;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
	}

	.empty {
		margin: 0;
		font: italic 0.95rem var(--font-lore);
		color: var(--muted);
	}

	.worth {
		margin: 0;
		font: 700 1.2rem var(--font-display);
		color: var(--accent);
	}

	.pill {
		padding: 12px 36px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		font: 600 0.95rem var(--font-ui);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.pill:hover,
	.pill:focus-visible {
		border-color: var(--text);
		background: rgb(255 255 255 / 0.1);
	}
</style>
