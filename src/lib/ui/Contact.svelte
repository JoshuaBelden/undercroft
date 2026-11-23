<script lang="ts">
	import { ApiError, quests as questApi } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { NPCS } from '#lib/content/npcs.ts';
	import { QUEST_ORDER, QUESTS } from '#lib/content/quests.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import { committable } from '#lib/shared/items/inventory.ts';
	import type { SlotRef } from '#lib/shared/items/types.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import {
		canComplete,
		objectiveCount,
		research,
		status,
		stillToCommit,
		test,
		trackedQuest,
		type QuestContext
	} from '#lib/shared/quests/engine.ts';
	import type { QuestDef } from '#lib/shared/quests/types.ts';
	import ContactPortrait from './ContactPortrait.svelte';
	import Slot from './Slot.svelte';
	import TipSlot from './TipSlot.svelte';

	/**
	 * One person on the surface (docs/dev/quests.md#on-the-surface-the-contacts-pages): their
	 * portrait and who they are, then Quests (only those open or done: never one still locked),
	 * Research (what they have learned, in the order earned) and Store (what they sell). Bring back
	 * what a quest asks for, then drag it from the stash onto the quest's slot (or choose Commit)
	 * to give it up for good. Every change is the server's.
	 */
	interface Props {
		npcId: string;
		explorer: ExplorerView;
		/** Ready or underground: nothing can be changed. */
		locked?: boolean;
		/** Something was committed, reported or bought (for a sound). */
		onchange?: (kind: 'commit' | 'report' | 'buy') => void;
	}

	let { npcId, explorer, locked = false, onchange }: Props = $props();

	const TABS = [
		['quests', 'Quests'],
		['research', 'Research'],
		['store', 'Store']
	] as const;

	let chosen = $state<string | null>(null);
	/** Done quests are listed under the open ones only when asked for. */
	let showDone = $state(false);
	let tab = $state<(typeof TABS)[number][0]>('quests');
	let error = $state('');
	let busy = $state(false);
	/** The stash slot being dragged. */
	let dragging = $state<SlotRef | null>(null);

	const npc = $derived(NPCS[npcId]);
	const record = $derived(explorer.quests);
	const context: QuestContext = $derived({
		resolved: (id: string) => explorer.afflictions.some((a) => a.id === id && a.resolved)
	});
	/** Open ones first (ready to report at the top), then done ones. */
	const shown = $derived.by(() => {
		const rank = { ready: 0, open: 1, done: 2 } as const;
		return npc.quests
			.map((id) => ({ def: QUESTS[id], status: status(record, id, context) }))
			.filter((q): q is { def: QuestDef; status: 'open' | 'ready' | 'done' } => !!q.status)
			.sort((a, b) => rank[a.status] - rank[b.status]);
	});
	const open = $derived(shown.filter((q) => q.status !== 'done'));
	const finished = $derived(shown.filter((q) => q.status === 'done'));
	const listed = $derived(showDone ? shown : open);
	const selected = $derived(listed.find((q) => q.def.id === chosen) ?? listed[0] ?? null);
	/** The stash, beside Quests only while the chosen quest still wants something from it; always for Store. */
	const showStash = $derived(
		tab === 'store' ||
			(tab === 'quests' &&
				!!selected &&
				selected.status !== 'done' &&
				stillToCommit(record, selected.def).length > 0)
	);
	/** How many slots the quest's stash shows. */
	const OFFERED = 5;
	/**
	 * Beside a quest, not the whole stash: five slots holding only what the chosen quest still
	 * wants, from the stash, then the backpack and quick slots (nothing lent); the rest empty.
	 */
	const offered = $derived.by(() => {
		const out: ({ ref: SlotRef; stack: ItemStack } | null)[] = [];
		if (tab === 'quests' && selected && selected.status !== 'done') {
			const wanted = new Set(stillToCommit(record, selected.def).map((c) => c.item));
			const areas: [SlotRef['area'], (ItemStack | null)[]][] = [
				['stash', explorer.stash],
				['backpack', explorer.loadout.backpack],
				['quick', explorer.loadout.quick]
			];
			for (const [area, slots] of areas) {
				slots.forEach((stack, index) => {
					if (stack && !stack.free && wanted.has(stack.item) && out.length < OFFERED) {
						out.push({ ref: { area, index } as SlotRef, stack });
					}
				});
			}
		}
		while (out.length < OFFERED) out.push(null);
		return out;
	});
	/** Everyone's open quests, not only this contact's: one is followed across them all. */
	const openIds = $derived(
		QUEST_ORDER.filter((id) => {
			const s = status(record, id, context);
			return s === 'open' || s === 'ready';
		})
	);
	const tracked = $derived(trackedQuest(openIds, settings.interface.trackedQuest));

	function track(id: string): void {
		settings.interface.trackedQuest = id;
		saveSettings();
	}
	const pages = $derived(research(record).filter((id) => QUESTS[id]?.npc === npcId));
	const sales = $derived(npc.sells.filter((s) => !s.when || test(s.when, record, context)));

	function progressOf(def: QuestDef) {
		return record.quests[def.id] ?? { counts: [], committed: {} };
	}

	async function run(kind: 'commit' | 'report' | 'buy', change: Parameters<typeof questApi>[0]) {
		if (busy || locked) return;
		busy = true;
		error = '';
		try {
			await questApi(change);
			onchange?.(kind);
		} catch (failed) {
			error = failed instanceof ApiError ? failed.message : 'Something went wrong. Try again';
		} finally {
			busy = false;
		}
	}

	/** Open, done below, and what is still wanted in hand: only Commit is left before Report. */
	function inHand(def: QuestDef): boolean {
		return canComplete(record, def, (item) => committable(explorer.stash, explorer.loadout, item));
	}

	/**
	 * The first slot holding `item` (not lent), to commit without dragging: the stash, then what was
	 * carried back up (the backpack and quick slots).
	 */
	function firstOf(item: string): SlotRef | null {
		const usable = (s: (typeof explorer.stash)[number]) => s?.item === item && !s.free;
		const stash = explorer.stash.findIndex(usable);
		if (stash >= 0) return { area: 'stash', index: stash };
		const pack = explorer.loadout.backpack.findIndex(usable);
		if (pack >= 0) return { area: 'backpack', index: pack };
		const quick = explorer.loadout.quick.findIndex(usable);
		return quick >= 0 ? { area: 'quick', index: quick } : null;
	}

	function commit(quest: string, from: SlotRef | null): void {
		if (from) void run('commit', { action: 'commit', quest, from });
	}

	function dropOn(quest: string, item: string) {
		return (event: DragEvent): void => {
			event.preventDefault();
			const from = dragging;
			dragging = null;
			if (!from || offered.find((o) => o?.ref === from)?.stack.item !== item) return;
			commit(quest, from);
		};
	}
</script>

<section class="contact" class:wide={showStash} aria-labelledby="contact-name">
	<aside class="who">
		<ContactPortrait {npc} />
		<h2 id="contact-name">{npc.name}</h2>
		<p class="role">{npc.role}</p>
		{#each npc.greeting as line (line.id)}<p class="said">“{line.text}”</p>{/each}
	</aside>

	<div class="pills" role="tablist" aria-label={npc.name}>
		{#each TABS as [id, label] (id)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === id}
				onclick={() => {
					tab = id;
					error = '';
				}}>{label}</button
			>
		{/each}
	</div>

	<div class="body" role="tabpanel" aria-label={TABS.find(([id]) => id === tab)?.[1]}>
		{#if error}<p class="error" role="alert">{error}</p>{/if}

		{#if tab === 'quests'}
			<div class="quests">
				<div class="column">
					<ul class="list">
						{#each listed as q (q.def.id)}
							<li>
								<button
									type="button"
									class:on={selected?.def.id === q.def.id}
									onclick={() => (chosen = q.def.id)}
								>
									<span class="title"
										>{#if tracked === q.def.id}<span
												class="tracked"
												role="img"
												aria-label="Tracked"
												title="Tracked"
											></span>{/if}{q.def.title}</span
									>
									<span class="state {q.status === 'open' && inHand(q.def) ? 'ready' : q.status}"
										>{q.status === 'ready'
											? 'Ready to report'
											: q.status === 'done'
												? 'Done'
												: inHand(q.def)
													? 'Ready to commit'
													: q.def.teaches}</span
									>
								</button>
							</li>
						{/each}
					</ul>
					{#if open.length === 0}
						<p class="muted">Nothing open. Come back later.</p>
					{/if}
					{#if finished.length}
						<button
							type="button"
							class="pill"
							aria-pressed={showDone}
							onclick={() => (showDone = !showDone)}
							>{showDone ? 'Hide completed' : 'Show completed'}</button
						>
					{/if}
				</div>

				{#if selected}
					{@const def = selected.def}
					{@const progress = progressOf(def)}
					<article class="quest">
						<div class="heading">
							<h3>{def.title}</h3>
							{#if selected.status !== 'done' && openIds.length > 1}
								<button
									type="button"
									class="pill track"
									aria-pressed={tracked === def.id}
									disabled={tracked === def.id}
									onclick={() => track(def.id)}
								>
									{#if tracked === def.id}<span class="tracked" aria-hidden="true"
										></span>Tracked{:else}Track{/if}
								</button>
							{/if}
						</div>
						{#each def.offer as line (line.id)}<p class="said">“{line.text}”</p>{/each}
						<ol class="objectives">
							{#each def.objectives as objective, i (objective.text.id)}
								{@const of = objectiveCount(objective)}
								{@const at = Math.min(progress.counts[i] ?? 0, of)}
								<li class:met={at >= of || selected.status === 'done'}>
									<span>{objective.text.text}</span>
									{#if of > 1}<span class="count">{at} / {of}</span>{/if}
								</li>
							{/each}
						</ol>
						{#if def.commit.length}
							<h4>Bring back</h4>
							<ul class="commits">
								{#each def.commit as wanted (wanted.item)}
									{@const given = progress.committed[wanted.item] ?? 0}
									{@const left = selected.status === 'done' ? 0 : wanted.count - given}
									<li
										class="drop"
										class:full={left <= 0}
										ondragover={(e) => {
											if (left > 0 && !locked) e.preventDefault();
										}}
										ondrop={dropOn(def.id, wanted.item)}
									>
										<TipSlot stack={{ item: wanted.item, count: wanted.count }} />
										<span class="text">
											<span class="name">{ITEMS[wanted.item]?.name ?? wanted.item}</span>
											<span class="who-gave"
												>{left <= 0
													? 'Committed'
													: `${wanted.count - left} of ${wanted.count} committed`}</span
											>
										</span>
										{#if left > 0 && selected.status !== 'done'}
											<button
												type="button"
												class="pill commit"
												disabled={locked || busy || !firstOf(wanted.item)}
												onclick={() => commit(def.id, firstOf(wanted.item))}>Commit</button
											>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
						{#if def.reward && selected.status !== 'done'}
							<h4>Rewards</h4>
							<ul class="rewards">
								{#if def.reward.coins}
									<li><span class="amount">{money(def.reward.coins)}</span></li>
								{/if}
								{#if def.reward.xp}
									<li><span class="amount">{def.reward.xp}</span> experience</li>
								{/if}
								{#each def.reward.items ?? [] as r (r.item)}
									<li class="item">
										<TipSlot stack={{ item: r.item, count: r.count }} />
										<span>{ITEMS[r.item]?.name ?? r.item}</span>
									</li>
								{/each}
							</ul>
						{/if}
						{#if selected.status === 'ready'}
							<button
								type="button"
								class="report"
								disabled={locked || busy}
								onclick={() => run('report', { action: 'report', quest: def.id })}
								>Report to {npc.name}</button
							>
						{:else if selected.status === 'open' && stillToCommit(record, def).length === 0 && def.commit.length}
							<p class="muted">Everything is committed. Finish what is asked above, then report.</p>
						{/if}
					</article>
				{/if}
			</div>
		{:else if tab === 'research'}
			{#if pages.length === 0}
				<p class="muted">Nothing yet. Bring {npc.name} something.</p>
			{:else}
				<ol class="research">
					{#each pages as id (id)}
						<li>
							<h3>{QUESTS[id].title}</h3>
							{#each QUESTS[id].page as line (line.id)}<p>{line.text}</p>{/each}
						</li>
					{/each}
				</ol>
			{/if}
		{:else if sales.length === 0}
			<p class="muted">{npc.name} has nothing to sell you yet.</p>
		{:else}
			<ul class="store">
				{#each sales as sale (sale.item)}
					<li>
						<TipSlot stack={{ item: sale.item, count: 1 }} />
						<span class="name">{ITEMS[sale.item]?.name ?? sale.item}</span>
						<button
							type="button"
							disabled={locked || busy || explorer.money < sale.price}
							onclick={() => run('buy', { action: 'buy', npc: npc.id, item: sale.item })}
							>{money(sale.price)}</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if showStash && tab === 'quests'}
		<!-- Only what the quest wants, if you have it: drag one onto its slot to commit it. -->
		<div class="stash" aria-label="What you have for it">
			<h3>Stash</h3>
			<ul class="grid">
				{#each offered as slot, i (i)}
					<li
						draggable={!!slot && !locked}
						ondragstart={() => (dragging = slot?.ref ?? null)}
						ondragend={() => (dragging = null)}
					>
						{#if slot}<TipSlot stack={slot.stack} />{:else}<Slot name={null} empty />{/if}
					</li>
				{/each}
			</ul>
		</div>
	{:else if showStash}
		<div class="stash" aria-label="Stash">
			<h3>Stash</h3>
			<ul class="grid">
				{#each explorer.stash as stack, index (index)}
					<li>
						{#if stack}<TipSlot {stack} />{:else}<Slot name={null} empty />{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

<style>
	/*
	 * The whole page: who they are down the left, the pills over what they offer, the stash on
	 * the right where it's useful (not for Research).
	 */
	.contact {
		display: grid;
		flex: 1;
		min-height: 0;
		grid-template-columns: 300px minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
		gap: 20px 40px;
		padding: 24px 0;
	}

	.contact.wide {
		grid-template-columns: 300px minmax(0, 1fr) auto;
	}

	.who {
		grid-row: 1 / span 2;
		display: flex;
		flex-direction: column;
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-self: end;
	}

	.contact.wide .pills {
		grid-column: 2 / span 2;
	}

	.body {
		min-width: 0;
		overflow-y: auto;
	}

	.stash {
		overflow-y: auto;
		/* Smaller slots than the Loadout's, so the quest beside them has room. */
		--slot-size: 72px;
	}

	@media (max-width: 1100px) {
		.contact,
		.contact.wide {
			grid-template-columns: 220px minmax(0, 1fr);
			grid-template-rows: auto auto auto;
		}

		.stash {
			grid-column: 2;
		}

		.contact.wide .pills {
			grid-column: 2;
		}
	}

	@media (max-width: 720px) {
		.contact,
		.contact.wide {
			grid-template-columns: 1fr;
			padding: 16px;
		}

		.who {
			grid-row: auto;
		}

		.stash,
		.contact.wide .pills {
			grid-column: 1;
		}
	}

	h2 {
		margin: 8px 0 0;
		font: 400 2rem var(--font-lore);
		letter-spacing: 0.08em;
	}

	.role,
	.muted {
		color: var(--muted);
	}

	.said {
		font-style: italic;
		line-height: 1.5;
	}

	.pills button {
		padding: 8px 20px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: rgb(0 0 0 / 0.3);
		color: var(--muted);
		font-size: 0.95rem;
		letter-spacing: 0.06em;
		cursor: pointer;
	}

	.pills button:hover {
		color: var(--text);
	}

	.pills button[aria-selected='true'] {
		border-color: var(--accent);
		background: var(--panel);
		color: var(--text);
	}

	.quests {
		display: grid;
		grid-template-columns: minmax(160px, 1fr) minmax(0, 2fr);
		gap: 16px;
	}

	@media (max-width: 560px) {
		.quests {
			grid-template-columns: 1fr;
		}
	}

	.list,
	.commits,
	.research,
	.store,
	.grid {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.column {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}

	.list {
		align-self: stretch;
	}

	/* Under the list: the done quests, listed under the open ones while it is on. */
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--panel);
		color: var(--muted);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.pill:hover,
	.pill[aria-pressed='true'] {
		color: var(--text);
	}

	/* The followed quest's mark: a yellow dot before its title. */
	.tracked {
		display: inline-block;
		flex: none;
		width: 8px;
		height: 8px;
		margin-right: 8px;
		border-radius: 50%;
		background: var(--launch-bright);
		box-shadow: 0 0 6px var(--launch-bright);
		vertical-align: middle;
	}

	.pill .tracked {
		margin-right: 0;
	}

	.track[aria-pressed='true'] {
		border-color: var(--launch);
		color: var(--launch-bright);
		opacity: 1;
		cursor: default;
	}

	.heading {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.heading h3 {
		margin: 0;
	}

	.list button {
		display: flex;
		width: 100%;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: none;
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}

	.list .title {
		font-weight: 400;
	}

	.list button.on .title {
		font-weight: 700;
	}

	.state {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.state.ready {
		color: var(--launch-bright);
	}

	h3 {
		margin: 0 0 8px;
		font: 400 1.2rem var(--font-lore);
	}

	h4 {
		margin: 16px 0 8px;
		font: 600 0.8rem var(--font-ui);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.objectives {
		padding-left: 20px;
	}

	.objectives li {
		margin: 4px 0;
	}

	.objectives li.met {
		color: var(--muted);
		text-decoration: line-through;
	}

	.count {
		margin-left: 8px;
		color: var(--muted);
	}

	.drop {
		display: flex;
		gap: 10px;
		align-items: center;
		margin: 6px 0;
		padding: 6px;
		border: 1px dashed var(--border);
		border-radius: 10px;
	}

	.drop.full {
		border-style: solid;
		border-color: var(--quest);
	}

	.drop .text {
		display: flex;
		flex: 1;
		flex-direction: column;
	}

	.who-gave {
		font-size: 0.85rem;
		color: var(--muted);
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.report {
		margin-top: 16px;
		padding: 8px 18px;
		border: 1px solid var(--launch);
		border-radius: 999px;
		background: none;
		color: var(--launch-bright);
		cursor: pointer;
	}

	/* What the quest pays: coin and experience as lines, items as slots with their tooltip. */
	.rewards {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 20px;
		margin: 0;
		padding: 0;
		list-style: none;
		--slot-size: 52px;
	}

	.rewards li {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--muted);
	}

	.rewards .amount {
		color: var(--text);
		font: 700 1.05rem var(--font-display);
	}

	/* Commit: a pill, in the accent while it can be pressed. */
	.commit {
		flex: none;
		color: var(--text);
		border-color: var(--accent);
	}

	.commit:disabled {
		opacity: 0.45;
		cursor: default;
		border-color: var(--border);
	}

	.research {
		max-width: 70ch;
	}

	.research li {
		margin-bottom: 24px;
		line-height: 1.6;
	}

	.store li {
		display: flex;
		gap: 10px;
		align-items: center;
		margin: 6px 0;
	}

	.store .name {
		flex: 1;
	}

	/* Each cell exactly one slot wide, so no picture spills into the next. */
	.grid {
		display: grid;
		grid-template-columns: repeat(5, var(--slot-size));
		gap: 8px;
	}

	.grid li {
		display: flex;
	}

	.grid li[draggable='true'] {
		cursor: grab;
	}

	.error {
		color: var(--broken);
	}
</style>
