<script lang="ts">
	import { HELP_TOPICS } from '#lib/content/help/index.ts';
	import type { HitNumber, TutorialCard } from '#lib/game/play/training.svelte.ts';

	/**
	 * The training ground's overlay (docs/dev/rumors.md): the tutorial step being shown, and the
	 * numbers rising off the dummies as they are hit.
	 */
	let {
		card,
		numbers,
		ondismiss
	}: { card: TutorialCard | null; numbers: HitNumber[]; ondismiss: () => void } = $props();

	const topic = $derived(card?.help ? HELP_TOPICS.find((t) => t.id === card.help) : undefined);
</script>

{#if card}
	<aside class="card" aria-live="polite">
		<strong>{card.title}</strong>
		<p>{card.line}</p>
		{#if topic}<p class="help">More in Help: {topic.title}</p>{/if}
		<button type="button" onclick={ondismiss}>Got it</button>
	</aside>
{/if}

{#each numbers as number (number.id)}
	<span
		class="number"
		style:left="{number.x}px"
		style:top="{number.y}px"
		style:opacity={number.fade}
		aria-hidden="true">{number.text}</span
	>
{/each}

<style>
	.card {
		position: fixed;
		left: 24px;
		bottom: 120px;
		z-index: 45;
		width: min(360px, calc(100vw - 48px));
		padding: 14px 16px;
		border: 1px solid rgb(201 176 120 / 0.45);
		border-radius: 14px;
		background: rgb(16 14 12 / 0.82);
		backdrop-filter: blur(4px);
		color: #e6dccb;
	}

	.card p {
		margin: 6px 0 0;
	}

	.help {
		color: var(--muted);
		font-size: 0.9em;
	}

	.card button {
		margin-top: 10px;
		border-radius: 999px;
	}

	.number {
		position: fixed;
		z-index: 40;
		translate: -50% -50%;
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 600;
		color: #f2d48a;
		text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
		pointer-events: none;
	}
</style>
