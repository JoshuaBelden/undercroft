<script lang="ts">
	import { imageUrl } from '#lib/content/images.ts';
	import { IMAGE_URLS } from '#lib/content/images.generated.ts';
	import type { NpcDef } from '#lib/shared/quests/types.ts';

	/**
	 * A contact's portrait (docs/dev/quests.md#on-the-surface-the-contacts-pages): head and
	 * shoulders on a transparent background, cut off at the bottom, with the bronze trim laid
	 * over the cut. As wide as its parent makes it. A letter stands in until the picture exists.
	 */
	interface Props {
		npc: NpcDef;
	}

	let { npc }: Props = $props();

	/** The trim: art/images/contact.profile.footer (cut out of its checkerboard, 972 x 253). */
	const FOOTER = 'contact.profile.footer';

	const portrait = $derived(npc.portrait in IMAGE_URLS ? imageUrl(npc.portrait) : null);
</script>

<span class="frame" aria-hidden="true">
	{#if portrait}
		<img class="face" src={portrait} alt="" />
	{:else}
		<span class="face initial">{npc.name[0]}</span>
	{/if}
	{#if FOOTER in IMAGE_URLS}
		<img class="footer" src={imageUrl(FOOTER)} alt="" />
	{/if}
</span>

<style>
	.frame {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
	}

	.face {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: contain;
		filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.5));
	}

	.initial {
		display: grid;
		place-items: center;
		font: 400 5rem var(--font-lore);
		color: var(--muted);
	}

	/*
	 * Narrower than the portrait, pulled up so its straight top edge covers where the shoulders
	 * are cut off (its bar is about a seventh of its height, which is about a quarter of its width).
	 */
	.footer {
		position: relative;
		width: 82%;
		margin-top: -2.5%;
		filter: drop-shadow(0 4px 8px rgb(0 0 0 / 0.6));
	}
</style>
