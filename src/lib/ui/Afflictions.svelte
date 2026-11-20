<script lang="ts">
	import { untrack } from 'svelte';
	import { AFFLICTIONS, AFFLICTION_ORDER, afflictionLocked } from '#lib/content/afflictions.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import AfflictionPane from './AfflictionPane.svelte';
	import { dragScroll } from './dragScroll.ts';

	interface Props {
		/** Whose page it is (their explorer id): what has faded in is remembered for them. */
		explorer: string;
		/** The explorer's rite progress (only Afflictions with any). */
		progress: ExplorerView['afflictions'];
		/** Given, each known pane has a Join Expedition button that calls this with its id. */
		onjoin?: (id: string) => void;
		/** Why joining is not possible right now (the buttons are disabled). */
		joinBlocked?: string;
		/** How many of each item the explorer owns (stash and loadout), for the requirement slots. */
		owned?: Record<string, number>;
	}

	let { explorer, progress, onjoin, joinBlocked, owned }: Props = $props();

	/**
	 * Afflictions unlocked since this page was last seen here (by this explorer, in this browser):
	 * each fades in from unknown once. Remembered in localStorage; without it, nothing fades.
	 */
	const KEY = 'undercroft.afflictionsRevealed';
	let revealing = $state<string[]>([]);
	$effect(() => {
		const unlocked = AFFLICTION_ORDER.filter(
			(id) =>
				!!AFFLICTIONS[id]?.requires &&
				!afflictionLocked(id, (done) => progress.some((p) => p.id === done && p.resolved))
		);
		const who = explorer;
		untrack(() => {
			let seen: Record<string, string[]>;
			try {
				seen = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string[]>;
			} catch {
				return;
			}
			const mine = seen[who] ?? [];
			const fresh = unlocked.filter((id) => !mine.includes(id));
			if (!fresh.length) return;
			revealing = [...revealing, ...fresh];
			try {
				localStorage.setItem(KEY, JSON.stringify({ ...seen, [who]: [...mine, ...fresh] }));
			} catch {
				// Not kept: it fades in again next time.
			}
		});
	});
</script>

<div class="afflictions">
	<div class="track" use:dragScroll>
		{#each AFFLICTION_ORDER as id (id)}
			<AfflictionPane
				{id}
				{progress}
				{owned}
				{joinBlocked}
				reveal={revealing.includes(id)}
				onjoin={onjoin && (() => onjoin(id))}
			/>
		{/each}
	</div>
	<p class="note">
		What you don't know yet is written on scraps down there. What you learn, you keep.
	</p>
</div>

<style>
	.afflictions {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
	}

	/* The strip of panes: scrolls sideways, by dragging (dragScroll), touch or the scrollbar. */
	.track {
		flex: none;
		display: flex;
		/* Centred while they fit; scrolling from the first once they don't. */
		justify-content: safe center;
		gap: 20px;
		padding: 24px 0 14px;
		overflow-x: auto;
		cursor: grab;
		user-select: none;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.track:global(.dragging) {
		cursor: grabbing;
	}

	/* Under the strip, clear of the corner buttons. */
	.note {
		margin: 0;
		padding: 0 140px 24px;
		text-align: center;
		color: var(--muted);
	}

	@media (max-width: 480px) {
		.track {
			gap: 12px;
			padding: 16px 0 12px;
		}

		.note {
			padding: 0 16px 80px;
		}
	}
</style>
