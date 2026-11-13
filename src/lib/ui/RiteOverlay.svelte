<script lang="ts">
	import { ITEMS } from '#lib/content/items.ts';
	import { MAP_KIT } from '#lib/content/map/kit.ts';
	import type { RiteSnapshot } from '#lib/shared/affliction/types.ts';
	import KeyCap from './KeyCap.svelte';
	import Slot from './Slot.svelte';

	/**
	 * What is known about the rite, always at the middle of the left edge while underground: the
	 * Affliction's name, the hints found so far, then a line down the left joining each thing the
	 * rite needs and the room.
	 * It takes no clicks and never lets go of the mouse. See docs/dev/rite.md.
	 */
	interface Props {
		/** The Affliction this rite resolves, e.g. "The Gloaming". */
		affliction: string;
		rite: RiteSnapshot;
		/** For each requirement, who in the party carries it and how many; `self` is this player. */
		carriers: { name: string; count: number; self: boolean }[][];
		/** The interact binding ("KeyE"; see KeyCap), shown as a keycap; empty when unbound. */
		interactKey: string;
	}

	let { affliction, rite, carriers, interactKey }: Props = $props();

	const room = $derived(rite.room ? (MAP_KIT[rite.room]?.title ?? rite.room) : null);

	/** This player carries some of it: its picture is in full colour. */
	function held(index: number): boolean {
		return (carriers[index] ?? []).some((carrier) => carrier.self && carrier.count > 0);
	}

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

<aside class="rite" class:resolved={rite.resolved} aria-label="The rite">
	<h2>
		<span class="pill">{affliction || 'The rite'}</span>
		{#if rite.resolved}<span class="done">Resolved</span>{/if}
	</h2>

	{#if rite.hints.length}
		<ol class="said">
			{#each rite.hints as hint, index (index)}
				<li>“{hint}”</li>
			{/each}
		</ol>
	{/if}

	<ol class="hints">
		{#each rite.requirements as requirement, index (index)}
			{@const def = requirement ? ITEMS[requirement.item] : undefined}
			<li class:unknown={!requirement}>
				<span class="slot" class:held={held(index)}>
					<Slot
						name={requirement ? (def?.name ?? requirement.item) : null}
						count={requirement?.count ?? 1}
						image={def?.image}
					/>
				</span>
				{#if requirement}
					<span class="text">
						<span class="name">{def?.name ?? requirement.item}</span>
						<span class="who">{carried(index, requirement.count)}</span>
					</span>
				{/if}
			</li>
		{/each}
		<li class="place" class:unknown={!room}>
			{#if room}
				<span class="text">
					<span class="name">{room}</span>
					<span class="who"
						>One of you carries it all here and holds {#if interactKey}<KeyCap
								code={interactKey}
							/>{:else}interact{/if}</span
					>
				</span>
			{:else}
				<span class="mark">Location: Unknown</span>
			{/if}
		</li>
	</ol>
</aside>

<style>
	.rite {
		--line: rgb(226 220 204 / 0.28);
		position: fixed;
		left: 16px;
		top: 50%;
		transform: translateY(-50%);
		width: min(280px, calc(100vw - 32px));
		font: 13px var(--font-ui);
		color: var(--text);
		text-shadow: 0 0 6px rgb(0 0 0 / 0.9);
		pointer-events: none;
		z-index: 6;
	}

	/* The name in a pill. */
	h2 {
		margin: 0 0 10px;
	}

	.pill {
		display: inline-block;
		padding: 3px 12px;
		border: 1px solid rgb(226 220 204 / 0.4);
		border-radius: 999px;
		font: 400 0.85rem var(--font-lore);
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.done {
		margin-left: 8px;
		font: 600 0.72rem var(--font-ui);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
	}

	/* Done: what it needed is behind them. */
	.rite.resolved .hints {
		opacity: 0.5;
	}

	/* The hints, in their own words. */
	.said {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
		display: grid;
		gap: 6px;
		font: italic 0.8rem var(--font-lore);
		line-height: 1.4;
	}

	/* One line down the left joins everything the rite needs. */
	.hints {
		list-style: none;
		margin: 0 0 0 8px;
		padding: 2px 0 2px 14px;
		display: grid;
		gap: 10px;
		border-left: 1px solid var(--line);
	}

	li {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 36px;
	}

	/* A short tick from the line to each hint. */
	li::before {
		content: '';
		position: absolute;
		left: -14px;
		top: 50%;
		width: 8px;
		border-top: 1px solid var(--line);
	}

	.slot {
		--slot-size: 36px;
		display: flex;
		flex: none;
		filter: grayscale(1) brightness(0.7);
		opacity: 0.7;
	}

	.slot.held {
		filter: none;
		opacity: 1;
	}

	/* Not known yet: the question mark says so, no dimming. */
	li.unknown .slot {
		filter: none;
		opacity: 1;
	}

	.text {
		display: grid;
		gap: 1px;
		min-width: 0;
	}

	/* Where the rite is held, until its hint tells. */
	.mark {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.who {
		font-size: 0.72rem;
		color: var(--muted);
	}
</style>
