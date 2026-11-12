<script lang="ts">
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { MAP_KIT } from '#lib/content/map/kit.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { riteSnapshot } from '#lib/shared/affliction/rite.ts';
	import Slot from './Slot.svelte';

	/**
	 * One Affliction as a tall pane: its picture and name, what is written of it, and what this
	 * explorer knows of its rite. Used in a strip on the Afflictions page, and (with `onselect`) as
	 * something to choose in the picker on the Expedition page.
	 */
	interface Props {
		/** Key into AFFLICTIONS; null for an Affliction nobody has met yet. */
		id: string | null;
		/** The explorer's rite progress (only Afflictions with any). */
		progress: ExplorerView['afflictions'];
		/** Given, the whole pane can be clicked to choose this Affliction. */
		onselect?: () => void;
		/** It is the one chosen. */
		selected?: boolean;
		/** Given, a known pane has a Join Expedition button that calls this. */
		onjoin?: () => void;
		/** Why joining is not possible right now; the button is disabled and says so. */
		joinBlocked?: string;
	}

	let { id, progress, onselect, selected = false, onjoin, joinBlocked }: Props = $props();

	/** Question-mark slots on an unknown pane. */
	const UNKNOWN_SLOTS = 3;
	/** The picture behind an unknown pane (static/assets/images). */
	const UNKNOWN_IMAGE = 'affliction-unknown-banner';

	const def = $derived(id === null ? null : (AFFLICTIONS[id] ?? null));
	const known = $derived(progress.find((entry) => entry.id === id));
	const rite = $derived(def ? riteSnapshot(def.rite, known?.clues ?? 0) : null);
	/** One per slot of the rite; null where no clue has revealed it. */
	const requirements = $derived(
		rite
			? rite.requirements.map((requirement) =>
					requirement
						? {
								name: ITEMS[requirement.item]?.name ?? requirement.item,
								image: ITEMS[requirement.item]?.image,
								quest: ITEMS[requirement.item]?.quest,
								count: requirement.count
							}
						: null
				)
			: Array.from({ length: UNKNOWN_SLOTS }, () => null)
	);
	const room = $derived(rite?.room ? (MAP_KIT[rite.room]?.title ?? rite.room) : null);
	const resolved = $derived(known?.resolved ?? false);
</script>

<article
	class="pane"
	class:unknown={def === null}
	class:selectable={onselect !== undefined}
	class:selected
	style:--art="url('/assets/images/{def?.image ?? UNKNOWN_IMAGE}.webp')"
>
	<header>
		<h2>{def?.name ?? 'Unknown'}</h2>
		{#if def}
			<span class="status" class:resolved>{resolved ? 'Resolved' : 'Unresolved'}</span>
		{/if}
	</header>

	<div class="content">
		<p class="flavor">{def?.flavor ?? 'Nothing is written of this one. Not yet.'}</p>

		<h3>Requirements</h3>
		<ul class="slots">
			{#each requirements as requirement, index (index)}
				<li>
					<Slot
						name={requirement?.name ?? null}
						image={requirement?.image}
						quest={requirement?.quest}
						count={requirement?.count}
					/>
				</li>
			{/each}
		</ul>

		<h3>Location</h3>
		<p class="room" class:hidden={!room}>{room ?? 'Unknown'}</p>

		{#if onjoin && def}
			<button
				type="button"
				class="join"
				disabled={joinBlocked !== undefined}
				title={joinBlocked}
				onclick={onjoin}
			>
				Join Expedition
			</button>
		{/if}
	</div>

	{#if onselect && def}
		<!-- Over the whole pane: clicking anywhere on it chooses it. -->
		<button
			type="button"
			class="choose"
			aria-label="Choose {def.name}"
			aria-pressed={selected}
			onclick={onselect}
		></button>
	{/if}
</article>

<style>
	/*
	 * A pane: the picture across the top (--art), the name in the middle of the first 250px of
	 * it, then the content on a fade. The pane is a little see-through: the page shows behind it.
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
			linear-gradient(rgb(33 28 24 / 0.8), rgb(10 9 8 / 0.8) 70%);
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
		display: flex;
		flex-direction: column;
		padding: 72px 24px 24px;
		background: linear-gradient(transparent, rgb(10 9 8 / 0.72) 110px, rgb(10 9 8 / 0.85));
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

	/* At the foot of the pane: on to the Expedition page with this Affliction chosen. */
	.join {
		align-self: center;
		margin-top: auto;
		padding: 10px 20px;
		border-color: var(--text);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.join:hover:not(:disabled),
	.join:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	.join:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.pane.unknown h2,
	.pane.unknown .flavor {
		color: var(--muted);
	}

	.pane.selectable {
		position: relative;
		border: 1px solid transparent;
	}

	.choose {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 1px solid transparent;
		background: transparent;
	}

	.choose:hover,
	.choose:focus-visible {
		border-color: var(--text);
		background: rgb(255 255 255 / 0.05);
	}

	.choose[aria-pressed='true'] {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	@media (max-width: 480px) {
		.pane {
			width: calc(100vw - 48px);
		}
	}
</style>
