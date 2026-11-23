<script lang="ts">
	import { money, stackSale } from '#lib/content/economy.ts';
	import { BACKDROP_IMAGE } from '#lib/content/images.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import type { ExpeditionSummary } from '#lib/shared/protocol.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import { onMount } from 'svelte';
	import type { SoundId } from '#lib/content/audio/sounds.ts';
	import { LEVELS } from '#lib/content/progression.ts';
	import { levelOf, levelProgress } from '#lib/shared/progression/progression.ts';
	import { slotMark, stackDetail } from './items.ts';
	import { parallax } from './parallax.ts';
	import Slot from './Slot.svelte';

	interface Props {
		summary: ExpeditionSummary;
		/** The Affliction the expedition went down against (empty if not known). */
		affliction: string;
		/** How the expedition ended for this player. */
		outcome: 'extracted' | 'died' | 'lost' | 'abandoned' | 'resolved';
		/** After watching the rest of the expedition: how many of the others got out alive. */
		escaped?: number | null;
		/** What was carried out (kept); null when it was lost. */
		carried: ItemStack[] | null;
		/** Back to the surface, on the loadout. */
		oncontinue: () => void;
		/** Play an interface sound (the level-up sting). */
		play?: (id: SoundId) => void;
	}

	let { summary, affliction, outcome, escaped = null, carried, oncontinue, play }: Props = $props();

	const TITLES = {
		extracted: 'You made it out',
		died: "You didn't make it out",
		lost: 'Lost in the dark',
		abandoned: 'You abandoned the expedition',
		resolved: 'The dark recedes'
	};

	const note = $derived(
		outcome === 'resolved'
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
	/** Experience now, and the level it makes (docs/dev/progression.md). */
	const xpAfter = $derived(summary.experience.before + summary.experience.earned);
	const levelBefore = $derived(levelOf(summary.experience.before));
	const levelAfter = $derived(levelOf(xpAfter));
	const gained = $derived(levelAfter - levelBefore);
	const capped = $derived(levelAfter >= LEVELS.max);
	/** Into the level they are at, and what the next takes. */
	const into = $derived(Math.round(levelProgress(xpAfter) * LEVELS.xpPerLevel));

	// A level gained: the sting, as the banner rises.
	onMount(() => {
		if (levelAfter > levelBefore) play?.('skills.mastered');
	});
	/** What the haul would fetch if all of it were sold. */
	const worth = $derived((carried ?? []).reduce((sum, stack) => sum + stackSale(stack), 0));
</script>

<!-- The whole window, like the screens on the surface: the expedition is over. -->
<main class="screen backdrop-art" style:--backdrop-image={BACKDROP_IMAGE} use:parallax>
	{#if gained > 0}
		<!-- Rewarded: rises over everything, then fades. -->
		<div class="levelled" role="status">
			<span class="up">Level up</span>
			<span class="to">Level {levelAfter}</span>
		</div>
	{/if}
	<section class="recap" aria-labelledby="recap-title" {@attach menu()}>
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
		<div class="progress" aria-label="Experience">
			<p class="gain">+{summary.experience.earned} experience</p>
			<p class="now">Level {levelAfter}</p>
			<div class="bar" aria-hidden="true">
				<span style:width="{levelProgress(xpAfter) * 100}%"></span>
			</div>
			<p class="next">
				{capped ? 'The highest level' : `${into} / ${LEVELS.xpPerLevel} to level ${levelAfter + 1}`}
			</p>
			{#if gained > 0}
				<p class="points">
					{gained === 1 ? 'A skill point' : `${gained} skill points`} to spend on the surface.
				</p>
			{/if}
		</div>

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

	/* Experience: what was earned, the level now, and the way to the next. */
	.progress {
		width: 100%;
		display: grid;
		justify-items: center;
		gap: 6px;
	}

	.progress p {
		margin: 0;
	}

	.gain {
		font: 700 1.2rem var(--font-display);
		color: var(--accent);
	}

	.now {
		font: 400 2rem var(--font-lore);
		letter-spacing: 0.08em;
	}

	.bar {
		width: min(360px, 100%);
		height: 6px;
		border-radius: 3px;
		background: rgb(255 255 255 / 0.1);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--launch-bright);
		animation: fill 1.2s ease-out;
	}

	@keyframes fill {
		from {
			width: 0;
		}
	}

	.next {
		font: 0.8rem var(--font-ui);
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.points {
		font: 700 1rem var(--font-display);
		color: var(--launch-bright);
	}

	/* A level gained: over the screen, rising in, then fading away. */
	.levelled {
		position: fixed;
		top: 30%;
		left: 50%;
		translate: -50% -50%;
		z-index: 1;
		display: grid;
		justify-items: center;
		gap: 4px;
		padding: 20px 48px;
		border: 1px solid var(--launch-bright);
		background: rgb(20 17 15 / 0.92);
		box-shadow: 0 0 40px rgb(205 164 42 / 0.35);
		pointer-events: none;
		animation: levelled 3.5s ease-out forwards;
	}

	.up {
		font: 600 0.85rem var(--font-ui);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--launch-bright);
	}

	.to {
		font: 400 2.4rem var(--font-lore);
		letter-spacing: 0.08em;
	}

	@keyframes levelled {
		0% {
			opacity: 0;
			scale: 0.85;
		}
		12% {
			opacity: 1;
			scale: 1.04;
		}
		20% {
			scale: 1;
		}
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			visibility: hidden;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.levelled {
			animation-name: fade;
		}

		.bar span {
			animation: none;
		}

		@keyframes fade {
			0%,
			70% {
				opacity: 1;
			}
			100% {
				opacity: 0;
				visibility: hidden;
			}
		}
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
