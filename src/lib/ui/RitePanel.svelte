<script lang="ts">
	import { ITEMS } from '#lib/content/items.ts';
	import { MAP_KIT } from '#lib/content/map/kit.ts';
	import type { RiteSnapshot } from '#lib/shared/affliction/types.ts';
	import Panel from './Panel.svelte';

	interface Props {
		/** The Affliction this rite resolves, e.g. "The Gloaming". */
		affliction: string;
		rite: RiteSnapshot;
		/** For each requirement, who in the party carries it and how many. */
		carriers: { name: string; count: number }[][];
		/** Label of the interact key. */
		interactKey: string;
		onclose: () => void;
	}

	let { affliction, rite, carriers, interactKey, onclose }: Props = $props();

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

<Panel title="The rite" {onclose}>
	<p class="lead">The rite that ends {affliction}.</p>

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

	<p class="muted">
		One of you has to carry everything the rite needs: drop things for each other to pool them. That
		person goes to the place and holds {interactKey}. Nothing has to be set down.
	</p>
</Panel>

<style>
	.lead {
		margin: 0;
	}

	h3 {
		margin: 20px 0 8px;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}

	li {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 8px 10px;
		background: rgb(255 255 255 / 0.03);
		border: 1px solid var(--border);
	}

	li.unknown .name {
		color: var(--muted);
		font-style: italic;
	}

	.who {
		color: var(--muted);
		text-align: right;
	}

	.muted {
		margin: 20px 0 0;
		color: var(--muted);
	}
</style>
