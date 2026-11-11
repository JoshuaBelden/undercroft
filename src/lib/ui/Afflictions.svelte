<script lang="ts">
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { MAP_KIT } from '#lib/content/map/kit.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { riteSnapshot } from '#lib/shared/affliction/rite.ts';
	import { dragScroll } from './dragScroll.ts';
	import Slot from './Slot.svelte';

	interface Props {
		/** The explorer's rite progress (only Afflictions with any). */
		progress: ExplorerView['afflictions'];
	}

	let { progress }: Props = $props();

	/** Panes shown after the real ones for Afflictions nobody has met yet. */
	const UNKNOWN_PANES = 4;
	/** Question-mark slots on an unknown pane. */
	const UNKNOWN_SLOTS = 3;
	/** The picture behind an unknown pane (static/assets/images). */
	const UNKNOWN_IMAGE = 'affliction-unknown-banner';

	interface Pane {
		key: string;
		/** Null for an Affliction nobody has met yet. */
		name: string | null;
		flavor: string;
		image: string;
		resolved: boolean;
		/** One per slot of the rite; null where no clue has revealed it. */
		requirements: ({ name: string; count: number } | null)[];
		room: string | null;
	}

	/** Every Affliction with what this explorer knows of its rite, then the unknown ones. */
	const panes = $derived<Pane[]>([
		...Object.values(AFFLICTIONS).map((def) => {
			const known = progress.find((entry) => entry.id === def.id);
			const rite = riteSnapshot(def.rite, known?.clues ?? 0);
			return {
				key: def.id,
				name: def.name,
				flavor: def.flavor,
				image: def.image,
				resolved: known?.resolved ?? false,
				requirements: rite.requirements.map((requirement) =>
					requirement
						? {
								name: ITEMS[requirement.item]?.name ?? requirement.item,
								count: requirement.count
							}
						: null
				),
				room: rite.room ? (MAP_KIT[rite.room]?.title ?? rite.room) : null
			};
		}),
		...Array.from({ length: UNKNOWN_PANES }, (_, index) => ({
			key: `unknown-${index}`,
			name: null,
			flavor: 'Nothing is written of this one. Not yet.',
			image: UNKNOWN_IMAGE,
			resolved: false,
			requirements: Array.from({ length: UNKNOWN_SLOTS }, () => null),
			room: null
		}))
	]);
</script>

<div class="afflictions">
	<div class="track" use:dragScroll>
		{#each panes as pane (pane.key)}
			<article
				class="pane"
				class:unknown={pane.name === null}
				style:--art="url('/assets/images/{pane.image}.webp')"
			>
				<header>
					<h2>{pane.name ?? 'Unknown'}</h2>
					{#if pane.name !== null}
						<span class="status" class:resolved={pane.resolved}>
							{pane.resolved ? 'Resolved' : 'Unresolved'}
						</span>
					{/if}
				</header>

				<div class="content">
					<p class="flavor">{pane.flavor}</p>

					<h3>What its rite needs</h3>
					<ul class="slots">
						{#each pane.requirements as requirement, index (index)}
							<li><Slot name={requirement?.name ?? null} count={requirement?.count} /></li>
						{/each}
					</ul>

					<h3>Where it is held</h3>
					<p class="room" class:hidden={!pane.room}>{pane.room ?? 'Unknown'}</p>
				</div>
			</article>
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

	/*
	 * A pane: the picture across the top (--art), the name in the middle of the first 250px of
	 * it, then the content on a fade that ends solid.
	 */
	.pane {
		flex: none;
		width: 400px;
		min-height: 730px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background:
			var(--art) top center / 100% auto no-repeat,
			linear-gradient(#211c18, var(--bg) 70%);
	}

	header {
		flex: none;
		height: 250px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 0 24px;
		text-align: center;
		text-shadow: 0 2px 12px rgb(0 0 0 / 0.9);
	}

	h2 {
		margin: 0;
		font-family: var(--font-lore);
		font-size: 2rem;
		font-weight: 600;
		letter-spacing: 0.08em;
	}

	.status {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text);
		opacity: 0.75;
	}

	.status.resolved {
		color: var(--accent);
		opacity: 1;
	}

	.content {
		flex: 1;
		padding: 72px 24px 24px;
		background: linear-gradient(transparent, rgb(10 9 8 / 0.88) 110px, var(--bg));
	}

	.flavor {
		margin: 0;
		font-size: 1.05rem;
		font-style: italic;
		line-height: 1.5;
	}

	h3 {
		margin: 24px 0 10px;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.slots {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.slots li {
		display: flex;
	}

	.room {
		margin: 0;
	}

	.room.hidden {
		color: var(--muted);
		font-style: italic;
	}

	.pane.unknown h2,
	.pane.unknown .flavor {
		color: var(--muted);
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

		.pane {
			width: calc(100vw - 48px);
		}

		.note {
			padding: 0 16px 80px;
		}
	}
</style>
