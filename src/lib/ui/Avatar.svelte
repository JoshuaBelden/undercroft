<script lang="ts">
	/**
	 * A player's avatar in a circle: the picture they uploaded or their Discord avatar, or a figure
	 * in the dark when there is none (or it won't load). See docs/dev/accounts.md#avatars.
	 */
	interface Props {
		/** The avatar's URL (`AccountView.avatar`, `PartyMember.avatar`), or null. */
		src: string | null;
		/** Pixels across. */
		size: number;
		/** Edged in the accent colour (a ready explorer). */
		lit?: boolean;
	}

	let { src, size, lit = false }: Props = $props();

	/** The URL that failed to load, so a new one gets its own try. */
	let failed = $state<string | null>(null);
	const shown = $derived(src && src !== failed ? src : null);
</script>

<span class="avatar" class:lit style:--size="{size}px" aria-hidden="true">
	{#if shown}
		<img
			src={shown}
			alt=""
			width={size}
			height={size}
			referrerpolicy="no-referrer"
			draggable="false"
			onerror={() => (failed = shown)}
		/>
	{:else}
		<svg viewBox="0 0 64 64">
			<circle cx="32" cy="25" r="11" />
			<path d="M10 64c0-17 10-27 22-27s22 10 22 27z" />
		</svg>
	{/if}
</span>

<style>
	.avatar {
		flex: none;
		display: block;
		width: var(--size);
		height: var(--size);
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: rgb(4 3 3 / 0.9);
	}

	.avatar.lit {
		border-color: var(--accent);
	}

	img,
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	img {
		object-fit: cover;
	}

	svg {
		fill: rgb(255 255 255 / 0.14);
	}
</style>
