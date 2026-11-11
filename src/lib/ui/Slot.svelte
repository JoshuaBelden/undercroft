<script lang="ts">
	interface Props {
		/** What is in the slot. Null is something not known yet: a grey question mark. */
		name: string | null;
		/** How many; shown from 2 up. */
		count?: number;
	}

	let { name, count = 1 }: Props = $props();
</script>

<!--
	The one slot of the game: a square that holds one thing. Use it wherever a thing sits in a
	place of its own, so slots look the same on every screen. See docs/dev/systems.md.
-->
<span class="slot">
	{#if name === null}
		<span class="mark" aria-hidden="true">?</span>
		<span class="hidden">Unknown</span>
	{:else}
		<span class="name">{name}</span>
		{#if count > 1}
			<span class="count">×{count}</span>
		{/if}
	{/if}
</span>

<style>
	.slot {
		position: relative;
		flex: none;
		width: 92px;
		height: 92px;
		display: grid;
		place-items: center;
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: rgb(255 255 255 / 0.04);
		overflow: hidden;
	}

	.name {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.2;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.count {
		position: absolute;
		right: 8px;
		bottom: 5px;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
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
