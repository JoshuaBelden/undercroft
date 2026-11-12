<script lang="ts">
	import { imageUrl } from '#lib/content/images.ts';
	import type { Rarity } from '#lib/content/items.ts';

	interface Props {
		/** What is in the slot. Null is something not known yet: a grey question mark. */
		name: string | null;
		/** How many; shown from 2 up. */
		count?: number;
		/** `large` is twice as wide and tall: the weapon slots. */
		size?: 'normal' | 'large';
		/** Nothing is in it: `name` is ignored and `hint` says what the slot is for. */
		empty?: boolean;
		hint?: string;
		/** Picture in static/assets/images (no extension), shown instead of the name. */
		image?: string;
		/** Small print in the bottom-left corner (rounds loaded). */
		detail?: string;
		/** How hard the thing in it is to come by: colours the left and bottom edge. */
		rarity?: Rarity;
		/** A quest item: a purple edge in place of the rarity's, and a purple mark. */
		quest?: boolean;
		/**
		 * A small icon in the bottom-left corner, before any `detail`: what kind of thing it is
		 * (`slotMark`: quest item, weapon, defense, treasure). `label` is read out.
		 */
		mark?: { icon: string; label: string };
	}

	let {
		name,
		count = 1,
		size = 'normal',
		empty = false,
		hint,
		image,
		detail,
		rarity = 'common',
		quest = false,
		mark
	}: Props = $props();

	/** Only something that is there and known has a rarity to show. A quest item shows that instead. */
	const shown = $derived(!empty && name !== null);
	const edge = $derived(shown && !quest && rarity !== 'common' ? rarity : null);
</script>

<!--
	The one slot of the game: a square that holds one thing. Use it wherever a thing sits in a
	place of its own, so slots look the same on every screen. `ItemSlot` wraps it for slots you can
	drag things between. See docs/dev/systems.md.
-->
<span
	class="slot"
	class:large={size === 'large'}
	class:empty
	class:uncommon={edge === 'uncommon'}
	class:rare={edge === 'rare'}
	class:epic={edge === 'epic'}
	class:legendary={edge === 'legendary'}
	class:quest={shown && quest}
>
	{#if empty}
		{#if hint}<span class="hint">{hint}</span>{/if}
	{:else if name === null}
		<span class="mark" aria-hidden="true">?</span>
		<span class="hidden">Unknown</span>
	{:else}
		{#if image}
			<img src={imageUrl(image)} alt={name} draggable="false" />
		{:else}
			<span class="name">{name}</span>
		{/if}
		{#if mark || detail}
			<span class="corner">
				{#if mark}
					<svg class="kind" viewBox="0 0 24 24" aria-hidden="true">
						<path fill="currentColor" d={mark.icon} />
					</svg>
					<span class="hidden">{mark.label}</span>
				{/if}
				{#if detail}<span class="detail">{detail}</span>{/if}
			</span>
		{/if}
		{#if count > 1}
			<span class="count">{count}</span>
		{/if}
	{/if}
</span>

<style>
	.slot {
		/*
		 * One slot's side and the gap between slots: a large slot covers two and the gap. A screen
		 * can set --slot-size to make its slots smaller (the Loadout page, in a narrow window).
		 */
		--slot: var(--slot-size, 92px);
		--slot-gap: 8px;
		position: relative;
		flex: none;
		width: var(--slot);
		height: var(--slot);
		display: grid;
		place-items: center;
		padding: 8px;
		/* A screen recolours the border through --slot-border, which leaves the rarity edge alone. */
		border: 1px solid var(--slot-border, var(--border));
		border-radius: 12px;
		background: rgb(255 255 255 / 0.04);
		overflow: hidden;
	}

	/* Rarity: the left and bottom edge, 2px. Common things have none. */
	.slot.uncommon {
		--rarity: var(--rarity-uncommon);
	}

	.slot.rare {
		--rarity: var(--rarity-rare);
	}

	.slot.epic {
		--rarity: var(--rarity-epic);
	}

	.slot.legendary {
		--rarity: var(--rarity-legendary);
	}

	/* Quest items: the same edge in purple, and a purple mark. */
	.slot.quest {
		--rarity: var(--quest);
	}

	.slot.quest .kind {
		color: var(--quest);
	}

	.slot.uncommon,
	.slot.rare,
	.slot.epic,
	.slot.legendary,
	.slot.quest {
		border-left: 2px solid var(--rarity);
		border-bottom: 2px solid var(--rarity);
	}

	.slot.large {
		width: calc(var(--slot) * 2 + var(--slot-gap));
		height: calc(var(--slot) * 2 + var(--slot-gap));
	}

	.slot.empty {
		background: rgb(0 0 0 / 0.25);
	}

	.name {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.2;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.large .name {
		font-size: 1rem;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.hint {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
		opacity: 0.6;
	}

	.count,
	.detail {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.count {
		position: absolute;
		bottom: 5px;
		right: 8px;
		font-size: 0.82rem;
		opacity: 0.75;
	}

	/* The bottom-left corner: the kind of thing it is, then the small print. */
	.corner {
		position: absolute;
		left: 7px;
		bottom: 5px;
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--muted);
	}

	.kind {
		flex: none;
		width: 14px;
		height: 14px;
	}

	.mark {
		font-family: var(--font-display);
		/* Scales with the slot (2.6rem at the default size), so small slots keep it inside. */
		font-size: calc(var(--slot) * 0.45);
		font-weight: 600;
		line-height: 1;
		color: var(--muted);
		opacity: 0.7;
	}

	/* Read out, not seen. */
	.hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
