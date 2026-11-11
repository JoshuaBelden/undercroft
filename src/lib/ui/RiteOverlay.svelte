<script lang="ts">
	import { ITEMS } from '#lib/content/items.ts';
	import { MAP_KIT } from '#lib/content/map/kit.ts';
	import type { RiteSnapshot } from '#lib/shared/affliction/types.ts';

	/**
	 * What is known about the rite, laid over the corner of the view while play goes on: it takes
	 * no clicks and never lets go of the mouse. Its key shows and hides it.
	 */
	interface Props {
		/** The Affliction this rite resolves, e.g. "The Gloaming". */
		affliction: string;
		rite: RiteSnapshot;
		/** For each requirement, who in the party carries it and how many. */
		carriers: { name: string; count: number }[][];
		/** Label of the interact key. */
		interactKey: string;
		/** Label of the key that hides the overlay again. */
		toggleKey: string;
	}

	let { affliction, rite, carriers, interactKey, toggleKey }: Props = $props();

	const room = $derived(rite.room ? (MAP_KIT[rite.room]?.title ?? rite.room) : null);

	function carried(index: number, needed: number): string {
		const who = carriers[index] ?? [];
		if (who.length === 0) return 'Nobody has it yet';
		const total = who.reduce((sum, carrier) => sum + carrier.count, 0);
		const names = who
			.map((carrier) => (needed > 1 ? `${carrier.name} (${carrier.count})` : carrier.name))
			.join(', ');
		return needed > 1 ? `${total} of ${needed}: ${names}` : `Carried by ${names}`;
	}
</script>

<aside class="rite" aria-label="The rite">
	<header>
		<h2>The rite</h2>
		{#if toggleKey}<span class="key">{toggleKey}</span>{/if}
	</header>
	<p class="lead">Ends {affliction}.</p>

	<h3>What it needs</h3>
	<ul>
		{#each rite.requirements as requirement, index (index)}
			<li class:unknown={!requirement}>
				{#if requirement}
					<span class="name">
						{requirement.count > 1 ? `${requirement.count} × ` : ''}{ITEMS[requirement.item]
							?.name ?? requirement.item}
					</span>
					<span class="who">{carried(index, requirement.count)}</span>
				{:else}
					<span class="name">Unknown</span>
					<span class="who">Find a clue</span>
				{/if}
			</li>
		{/each}
	</ul>

	<h3>Where</h3>
	<ul>
		<li class:unknown={!room}>
			<span class="name">{room ?? 'Unknown'}</span>
			{#if !room}<span class="who">The last clue tells</span>{/if}
		</li>
	</ul>

	<p class="hint">One of you carries it all there, and holds {interactKey}.</p>
</aside>

<style>
	.rite {
		position: fixed;
		top: 16px;
		right: 16px;
		width: min(300px, calc(100vw - 32px));
		padding: 12px 14px 14px;
		font: 13px var(--font-ui);
		color: var(--text);
		background: rgb(6 5 5 / 0.62);
		border: 1px solid rgb(226 220 204 / 0.18);
		border-radius: 10px;
		text-shadow: 0 0 6px rgb(0 0 0 / 0.8);
		pointer-events: none;
		z-index: 6;
		animation: arrive 0.18s ease-out;
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	h2 {
		margin: 0;
		font: 400 1.05rem var(--font-lore);
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	.key {
		padding: 1px 7px;
		border: 1px solid rgb(226 220 204 / 0.35);
		border-radius: 4px;
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.lead {
		margin: 2px 0 0;
		color: var(--muted);
	}

	h3 {
		margin: 12px 0 5px;
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 5px;
	}

	li {
		display: grid;
		gap: 1px;
		padding-left: 9px;
		border-left: 2px solid rgb(226 220 204 / 0.45);
	}

	li.unknown {
		border-left-color: rgb(226 220 204 / 0.15);
	}

	li.unknown .name {
		color: var(--muted);
		font-style: italic;
	}

	.who {
		font-size: 0.72rem;
		color: var(--muted);
	}

	.hint {
		margin: 12px 0 0;
		font-size: 0.72rem;
		color: var(--muted);
	}

	@keyframes arrive {
		from {
			opacity: 0;
			translate: 8px 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.rite {
			animation: none;
		}
	}
</style>
