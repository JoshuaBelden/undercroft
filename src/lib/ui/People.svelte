<script lang="ts">
	import { ApiError, quests as questApi } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import { imageUrl } from '#lib/content/images.ts';
	import { IMAGE_URLS } from '#lib/content/images.generated.ts';
	import { ITEMS } from '#lib/content/items.ts';
	import { NPCS, NPC_ORDER } from '#lib/content/npcs.ts';
	import { QUESTS } from '#lib/content/quests.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import type { SlotRef } from '#lib/shared/items/types.ts';
	import {
		casebook,
		objectiveCount,
		status,
		stillToCommit,
		test,
		type QuestContext
	} from '#lib/shared/quests/engine.ts';
	import type { QuestDef } from '#lib/shared/quests/types.ts';
	import TipSlot from './TipSlot.svelte';

	/**
	 * The people on the surface (docs/dev/quests.md#npcs): each one's quests (only those open or
	 * done: never one still locked), what they have learned (the casebook, in the order earned),
	 * and what they sell. Bring back what a quest asks for, then drag it from the stash onto the
	 * quest's slot (or choose Commit) to give it up for good. Every change is the server's.
	 */
	interface Props {
		explorer: ExplorerView;
		/** Ready or underground: nothing can be changed. */
		locked?: boolean;
		/** Something was committed, reported or bought (for a sound). */
		onchange?: (kind: 'commit' | 'report' | 'buy') => void;
	}

	let { explorer, locked = false, onchange }: Props = $props();

	let npcId = $state(NPC_ORDER[0]);
	let chosen = $state<string | null>(null);
	let tab = $state<'quests' | 'casebook' | 'shop'>('quests');
	let error = $state('');
	let busy = $state(false);
	/** The stash slot being dragged. */
	let dragging = $state<number | null>(null);

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
	const selected = $derived(shown.find((q) => q.def.id === chosen) ?? shown[0] ?? null);
	const pages = $derived(casebook(record).filter((id) => QUESTS[id]?.npc === npcId));
	const sales = $derived(npc.sells.filter((s) => !s.when || test(s.when, record, context)));
	const portrait = $derived(npc.portrait in IMAGE_URLS ? imageUrl(npc.portrait) : null);

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

	/** The first stash slot holding `item` (not lent), to commit without dragging. */
	function firstOf(item: string): SlotRef | null {
		const index = explorer.stash.findIndex((s) => s?.item === item && !s.free);
		return index < 0 ? null : { area: 'stash', index };
	}

	function commit(quest: string, from: SlotRef | null): void {
		if (from) void run('commit', { action: 'commit', quest, from });
	}

	function dropOn(quest: string, item: string) {
		return (event: DragEvent): void => {
			event.preventDefault();
			const index = dragging;
			dragging = null;
			if (index === null || explorer.stash[index]?.item !== item) return;
			commit(quest, { area: 'stash', index });
		};
	}
</script>

<section class="people" aria-labelledby="people-title">
	<h2 id="people-title" class="sr-only">People</h2>
	{#if NPC_ORDER.length > 1}
		<div class="tabs" role="tablist" aria-label="People">
			{#each NPC_ORDER as id (id)}
				<button
					type="button"
					role="tab"
					aria-selected={npcId === id}
					onclick={() => {
						npcId = id;
						chosen = null;
					}}>{NPCS[id].name}</button
				>
			{/each}
		</div>
	{/if}

	<div class="columns">
		<div class="npc">
			<header>
				<div class="portrait" aria-hidden="true">
					{#if portrait}<img src={portrait} alt="" />{:else}<span>{npc.name[0]}</span>{/if}
				</div>
				<div>
					<h3>{npc.name}</h3>
					<p class="role">{npc.role}</p>
				</div>
			</header>
			{#each npc.greeting as line (line.id)}<p class="said">“{line.text}”</p>{/each}

			<div class="tabs" role="tablist" aria-label={npc.name}>
				{#each [['quests', 'Quests'], ['casebook', 'Casebook'], ['shop', 'Buy']] as const as [id, label] (id)}
					<button type="button" role="tab" aria-selected={tab === id} onclick={() => (tab = id)}
						>{label}</button
					>
				{/each}
			</div>

			{#if error}<p class="error" role="alert">{error}</p>{/if}

			{#if tab === 'quests'}
				<div class="quests">
					<ul class="list">
						{#each shown as q (q.def.id)}
							<li>
								<button
									type="button"
									class:on={selected?.def.id === q.def.id}
									onclick={() => (chosen = q.def.id)}
								>
									<span class="title">{q.def.title}</span>
									<span class="state {q.status}"
										>{q.status === 'ready'
											? 'Ready to report'
											: q.status === 'done'
												? 'Done'
												: q.def.teaches}</span
									>
								</button>
							</li>
						{/each}
					</ul>

					{#if selected}
						{@const def = selected.def}
						{@const progress = progressOf(def)}
						<article class="quest">
							<h4>{def.title}</h4>
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
								<h5>Bring back</h5>
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
												<span class="who"
													>{left <= 0
														? 'Committed'
														: `${wanted.count - left} of ${wanted.count} committed`}</span
												>
											</span>
											{#if left > 0 && selected.status !== 'done'}
												<button
													type="button"
													disabled={locked || busy || !firstOf(wanted.item)}
													onclick={() => commit(def.id, firstOf(wanted.item))}>Commit</button
												>
											{/if}
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
								<p class="muted">
									Everything is committed. Finish what is asked below, then report.
								</p>
							{/if}
							{#if def.reward && selected.status !== 'done'}
								<p class="reward">
									Pays {[
										def.reward.coins ? money(def.reward.coins) : null,
										...(def.reward.items ?? []).map((r) => ITEMS[r.item]?.name ?? r.item),
										def.reward.xp ? `${def.reward.xp} experience` : null
									]
										.filter(Boolean)
										.join(', ')}
								</p>
							{/if}
						</article>
					{/if}
				</div>
			{:else if tab === 'casebook'}
				{#if pages.length === 0}
					<p class="muted">Nothing yet. Bring her something.</p>
				{:else}
					<ol class="casebook">
						{#each pages as id (id)}
							<li>
								<h4>{QUESTS[id].title}</h4>
								{#each QUESTS[id].page as line (line.id)}<p>{line.text}</p>{/each}
							</li>
						{/each}
					</ol>
				{/if}
			{:else}
				{#if sales.length === 0}
					<p class="muted">{npc.name} has nothing to sell you yet.</p>
				{:else}
					<ul class="shop">
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
			{/if}
		</div>

		<div class="stash" aria-label="Stash">
			<h3>Stash</h3>
			<p class="muted">Drag something onto what a quest asks for to commit it.</p>
			<ul class="grid">
				{#each explorer.stash as stack, index (index)}
					<li
						class:empty={!stack}
						draggable={!!stack && !stack.free && !locked}
						ondragstart={() => (dragging = index)}
						ondragend={() => (dragging = null)}
					>
						{#if stack}<TipSlot {stack} />{/if}
					</li>
				{/each}
			</ul>
		</div>
	</div>
</section>

<style>
	.people {
		max-width: 1100px;
		margin: 0 auto;
		padding: 24px 16px;
	}

	.columns {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: 24px;
	}

	@media (max-width: 800px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}

	header {
		display: flex;
		gap: 16px;
		align-items: center;
	}

	.portrait {
		display: grid;
		place-items: center;
		width: 96px;
		height: 96px;
		flex: none;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--panel);
		font: 400 2.4rem var(--font-lore);
		color: var(--muted);
	}

	.portrait img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	h3 {
		margin: 0;
		font: 400 1.6rem var(--font-lore);
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

	.tabs {
		display: flex;
		gap: 4px;
		margin: 16px 0 12px;
	}

	.tabs button {
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}

	.tabs button[aria-selected='true'] {
		border-color: var(--accent);
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
	.casebook,
	.shop,
	.grid {
		margin: 0;
		padding: 0;
		list-style: none;
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

	.list button.on {
		border-color: var(--border);
		background: var(--panel);
	}

	.state {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.state.ready {
		color: var(--launch-bright);
	}

	h4 {
		margin: 0 0 8px;
		font: 400 1.2rem var(--font-lore);
	}

	h5 {
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

	.who {
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

	.reward {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.casebook li {
		margin-bottom: 20px;
		line-height: 1.5;
	}

	.shop li {
		display: flex;
		gap: 10px;
		align-items: center;
		margin: 6px 0;
	}

	.shop .name {
		flex: 1;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
		gap: 6px;
	}

	.grid li {
		min-height: 64px;
		border: 1px solid var(--border);
		border-radius: 12px;
	}

	.grid li[draggable='true'] {
		cursor: grab;
	}

	.error {
		color: var(--broken);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
