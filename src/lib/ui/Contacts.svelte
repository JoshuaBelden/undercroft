<script lang="ts">
	import { resolve } from '$app/paths';
	import { NPCS, NPC_ORDER } from '#lib/content/npcs.ts';
	import ContactPortrait from './ContactPortrait.svelte';

	/**
	 * The Contacts page (docs/dev/quests.md#on-the-surface-the-contacts-pages): the people on the
	 * surface, each only a portrait and a name. Choosing one opens their page.
	 */
</script>

<section class="contacts" aria-labelledby="contacts-title">
	<h2 id="contacts-title" class="sr-only">Contacts</h2>
	<ul>
		{#each NPC_ORDER as id (id)}
			{@const npc = NPCS[id]}
			<li>
				<a href={resolve('/(hub)/contacts/[npc]', { npc: id })}>
					<span class="portrait"><ContactPortrait {npc} /></span>
					<span class="name">{npc.name}</span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	.contacts {
		display: grid;
		flex: 1;
		place-items: center;
		padding: 24px 16px;
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 48px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: var(--text);
		text-decoration: none;
	}

	.portrait {
		display: block;
		width: min(360px, 70vw);
		transition:
			transform 0.2s ease,
			filter 0.2s ease;
	}

	a:hover .portrait,
	a:focus-visible .portrait {
		transform: scale(1.03);
		filter: brightness(1.08);
	}

	a:focus-visible {
		outline: none;
	}

	a:focus-visible .name {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-underline-offset: 6px;
	}

	.name {
		font: 400 1.8rem var(--font-lore);
		letter-spacing: 0.08em;
	}

	@media (prefers-reduced-motion: reduce) {
		.portrait {
			transition: none;
		}

		a:hover .portrait,
		a:focus-visible .portrait {
			transform: none;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
