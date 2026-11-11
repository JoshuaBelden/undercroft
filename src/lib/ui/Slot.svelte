<script lang="ts">
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
	}

	let { name, count = 1, size = 'normal', empty = false, hint, image, detail }: Props = $props();
</script>

<!--
	The one slot of the game: a square that holds one thing. Use it wherever a thing sits in a
	place of its own, so slots look the same on every screen. `ItemSlot` wraps it for slots you can
	drag things between. See docs/dev/systems.md.
-->
<span class="slot" class:large={size === 'large'} class:empty>
	{#if empty}
		{#if hint}<span class="hint">{hint}</span>{/if}
	{:else if name === null}
		<span class="mark" aria-hidden="true">?</span>
		<span class="hidden">Unknown</span>
	{:else}
		{#if image}
			<img src="/assets/images/{image}.webp" alt={name} draggable="false" />
		{:else}
			<span class="name">{name}</span>
		{/if}
		{#if detail}
			<span class="detail">{detail}</span>
		{/if}
		{#if count > 1}
			<span class="count">×{count}</span>
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
		border: 1px solid var(--border);
		border-radius: 12px;
		background: rgb(255 255 255 / 0.04);
		overflow: hidden;
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
		position: absolute;
		bottom: 5px;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.count {
		right: 8px;
	}

	.detail {
		left: 8px;
		color: var(--muted);
	}

	.mark {
		font-family: var(--font-display);
		font-size: 2.6rem;
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
