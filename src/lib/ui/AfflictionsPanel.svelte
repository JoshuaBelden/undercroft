<script lang="ts">
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { MAP_KIT } from '#lib/content/map/kit.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { riteSnapshot } from '#lib/shared/affliction/rite.ts';
	import Panel from './Panel.svelte';

	interface Props {
		/** The explorer's rite progress (only Afflictions with any). */
		progress: ExplorerView['afflictions'];
		onclose: () => void;
	}

	let { progress, onclose }: Props = $props();

	/** Every Affliction, with what this explorer knows of its rite. */
	const afflictions = $derived(
		Object.values(AFFLICTIONS).map((def) => {
			const known = progress.find((entry) => entry.id === def.id);
			const rite = riteSnapshot(def.rite, known?.clues ?? 0);
			return {
				id: def.id,
				name: def.name,
				resolved: known?.resolved ?? false,
				requirements: rite.requirements.map((requirement) =>
					requirement
						? `${requirement.count > 1 ? `${requirement.count} × ` : ''}${
								ITEMS[requirement.item]?.name ?? requirement.item
							}`
						: null
				),
				room: rite.room ? (MAP_KIT[rite.room]?.title ?? rite.room) : null
			};
		})
	);
</script>

<Panel title="Afflictions" {onclose}>
	{#each afflictions as affliction (affliction.id)}
		<section>
			<header>
				<h3>{affliction.name}</h3>
				<span class="status" class:resolved={affliction.resolved}>
					{affliction.resolved ? 'Resolved' : 'Unresolved'}
				</span>
			</header>

			<h4>What its rite needs</h4>
			<ul>
				{#each affliction.requirements as requirement, index (index)}
					<li class:unknown={!requirement}>{requirement ?? 'Unknown'}</li>
				{/each}
			</ul>

			<h4>Where it is held</h4>
			<ul>
				<li class:unknown={!affliction.room}>{affliction.room ?? 'Unknown'}</li>
			</ul>
		</section>
	{/each}
	<p class="muted">
		What you don't know yet is written on scraps down there. What you learn, you keep.
	</p>
</Panel>

<style>
	section + section {
		margin-top: 24px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: normal;
		letter-spacing: 0.08em;
	}

	.status {
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.status.resolved {
		color: var(--accent);
	}

	h4 {
		margin: 16px 0 8px;
		font-size: 0.8rem;
		font-weight: normal;
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
		padding: 8px 10px;
		background: rgb(255 255 255 / 0.03);
		border: 1px solid var(--border);
	}

	li.unknown {
		color: var(--muted);
		font-style: italic;
	}

	.muted {
		margin: 20px 0 0;
		color: var(--muted);
	}
</style>
