<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError, skills as changeSkills } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import {
		LEVELS,
		RESPEC_COST,
		SKILL_CATEGORIES,
		SKILLS,
		type SkillCategory,
		type SkillDef
	} from '#lib/content/progression.ts';
	import { HOLD_TIME } from '#lib/game/input/hold.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import type { ExplorerView } from '#lib/shared/account/types.ts';
	import {
		bonusAt,
		canSpend,
		levelOf,
		levelProgress,
		MAX_RANK,
		pointsLeft,
		pointsSpent,
		progressionOf,
		SPEND_ERRORS,
		summaryAt,
		type SpendTarget
	} from '#lib/shared/progression/progression.ts';

	/**
	 * The skill tree (docs/dev/progression.md#the-skill-tree). The categories sit at the bottom
	 * with the points left; the chosen one's four skills rise above them, joined to the connector
	 * skill at the top (not in the game yet: a "?"). Holding a skill (or a closed category) spends
	 * a point on it: the mouse or a finger held on it, Enter or Space held, or the controller's X
	 * held with it focused. Every change is the server's.
	 */
	interface Props {
		explorer: ExplorerView;
		/** Ready or underground: nothing can be changed. */
		locked?: boolean;
		/** Something happened, for its sound. */
		onsound?: (kind: 'unlock' | 'rank' | 'mastered' | 'denied' | 'respec') => void;
	}

	let { explorer, locked = false, onsound }: Props = $props();

	const p = $derived(progressionOf({ ...explorer.progression, firsts: [] }));
	const level = $derived(levelOf(p.xp));
	const left = $derived(pointsLeft(p));

	let category = $state<SkillCategory>('nerve');
	/** The skill shown in the panel (focused or hovered), or null for the category. */
	let shown = $state<string | null>(null);
	let error = $state('');
	let busy = $state(false);
	let confirming = $state(false);

	const opened = $derived(p.categories.includes(category));
	const tree = $derived(SKILLS.filter((s) => s.category === category));
	const shownSkill = $derived(tree.find((s) => s.id === shown) ?? null);
	const weapon = $derived(explorer.loadout.equipment.primary?.item ?? null);

	/** A hold under way: what it spends on and when it began, and how far it has got (0..1). */
	let hold = $state<{ key: string; target: SpendTarget; start: number } | null>(null);
	let progress = $state(0);
	let raf = 0;

	const keyOf = (target: SpendTarget): string =>
		'category' in target ? `category:${target.category}` : `skill:${target.skill}`;

	function begin(target: SpendTarget): void {
		if (locked || busy) return;
		hold = { key: keyOf(target), target, start: performance.now() };
		progress = 0;
		cancelAnimationFrame(raf);
		const tick = (): void => {
			if (!hold) return;
			progress = Math.min(1, (performance.now() - hold.start) / HOLD_TIME);
			if (progress >= 1) {
				const target = hold.target;
				hold = null;
				progress = 0;
				void commit(target);
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	}

	function end(): void {
		hold = null;
		progress = 0;
		cancelAnimationFrame(raf);
	}

	async function commit(target: SpendTarget): Promise<void> {
		const refused = canSpend(p, target);
		if (refused) {
			error = SPEND_ERRORS[refused];
			onsound?.('denied');
			return;
		}
		const before = 'skill' in target ? (p.skills[target.skill] ?? 0) : 0;
		busy = true;
		error = '';
		try {
			await changeSkills(
				'category' in target
					? { action: 'spend', category: target.category }
					: { action: 'spend', skill: target.skill }
			);
			onsound?.('category' in target ? 'unlock' : before + 1 >= MAX_RANK ? 'mastered' : 'rank');
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong';
			onsound?.('denied');
		} finally {
			busy = false;
		}
	}

	async function respec(): Promise<void> {
		busy = true;
		error = '';
		try {
			await changeSkills({ action: 'respec' });
			onsound?.('respec');
			confirming = false;
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong';
			onsound?.('denied');
		} finally {
			busy = false;
		}
	}

	/** Pointer, keys and the controller's X all hold the same way. */
	function holdable(target: () => SpendTarget) {
		return {
			onpointerdown: (event: PointerEvent) => {
				if (event.button !== 0) return;
				(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
				begin(target());
			},
			onpointerup: end,
			onpointercancel: end,
			onlostpointercapture: end,
			onkeydown: (event: KeyboardEvent) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				if (!event.repeat) begin(target());
			},
			onkeyup: (event: KeyboardEvent) => {
				if (event.key === 'Enter' || event.key === ' ') end();
			},
			onblur: end,
			// A click is not a spend: only a hold is.
			onclick: (event: MouseEvent) => event.preventDefault()
		};
	}

	/** The controller's X held with a skill or category focused. */
	function padHolding(button: 'x' | 'y', down: boolean): void {
		if (button !== 'x') return;
		if (!down) {
			end();
			return;
		}
		const focused = document.activeElement;
		if (!(focused instanceof HTMLElement)) return;
		const skill = focused.dataset.skill;
		const cat = focused.dataset.category as SkillCategory | undefined;
		if (skill) begin({ skill });
		else if (cat) begin({ category: cat });
	}

	onMount(() => () => cancelAnimationFrame(raf));

	/** What a skill comes to, without it, now, and at the next rank. */
	function lines(skill: SkillDef): { now: string; next: string | null; base: string } {
		const rank = p.skills[skill.id] ?? 0;
		const context = { weapon };
		return {
			base: skill.detail(0, context),
			now: skill.detail(bonusAt(skill, rank), context),
			next: rank < MAX_RANK ? skill.detail(bonusAt(skill, rank + 1), context) : null
		};
	}

	/** Three slots around each icon, from the top, filled as it ranks up. */
	const SLOT_ANGLES = [-90, 30, 150];
	/** Where each of the four skills sits across the tree (0..100), and the connector. */
	const COLUMNS = [12.5, 37.5, 62.5, 87.5];
</script>

<section class="skills" {@attach menu({ key: 'skills', holding: padHolding })}>
	<header class="level">
		<div class="numbers">
			<span class="big">Level {level}</span>
			<span class="muted">
				{#if level >= LEVELS.max}
					The most there is
				{:else}
					{p.xp % LEVELS.xpPerLevel} / {LEVELS.xpPerLevel} to level {level + 1}
				{/if}
			</span>
		</div>
		<div
			class="bar"
			role="progressbar"
			aria-label="Experience to the next level"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(levelProgress(p.xp) * 100)}
		>
			<span style:width="{levelProgress(p.xp) * 100}%"></span>
		</div>
	</header>

	<div class="tree" aria-label="{SKILL_CATEGORIES.find((c) => c.id === category)?.name} skills">
		<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
			{#each COLUMNS as x (x)}
				<path d="M {x} 78 C {x} 45, 50 50, 50 18" class:lit={opened} />
			{/each}
		</svg>

		<div class="connector" style:left="50%">
			<span class="icon unknown" title="Not in the game yet">?</span>
		</div>

		{#each tree as skill, i (skill.id)}
			{@const rank = p.skills[skill.id] ?? 0}
			{@const key = `skill:${skill.id}`}
			<div class="node" style:left="{COLUMNS[i]}%">
				<button
					type="button"
					class="icon"
					class:closed={!opened}
					class:ranked={rank > 0}
					class:holding={hold?.key === key}
					style:--hold={hold?.key === key ? progress : 0}
					data-skill={skill.id}
					aria-label={opened
						? `${skill.name}, rank ${rank} of ${MAX_RANK}. Hold to spend a point.`
						: 'A skill not yet open'}
					disabled={locked}
					onfocus={() => (shown = skill.id)}
					onpointerenter={() => (shown = skill.id)}
					{...holdable(() => ({ skill: skill.id }))}
				>
					<span class="glyph">{opened ? skill.icon : '?'}</span>
					{#each SLOT_ANGLES as angle, slot (angle)}
						<span
							class="slot"
							class:filled={slot < rank}
							style:--angle="{angle}deg"
							aria-hidden="true"
						></span>
					{/each}
				</button>
				<span class="name">{opened ? skill.name : '?'}</span>
			</div>
		{/each}
	</div>

	<div class="detail" aria-live="polite">
		{#if !opened}
			{@const c = SKILL_CATEGORIES.find((k) => k.id === category)}
			<h2>{c?.name}: {c?.blurb}</h2>
			<p>Hold the category below to open it for a point, and its four skills show.</p>
		{:else if shownSkill}
			{@const rank = p.skills[shownSkill.id] ?? 0}
			{@const l = lines(shownSkill)}
			<h2>{shownSkill.name} <span class="muted">rank {rank} of {MAX_RANK}</span></h2>
			<p>{summaryAt(shownSkill, rank || 1)}</p>
			<p>
				{#if rank > 0}
					<strong>{l.now}</strong> <span class="muted">(was: {l.base})</span>
				{:else}
					Now: {l.base}
				{/if}
			</p>
			{#if l.next}
				<p>Next rank: <strong>{l.next}</strong></p>
			{/if}
		{:else}
			<p class="muted">Point at a skill to see what it does. Hold it to spend a point.</p>
		{/if}
	</div>

	<footer class="bottom">
		<div class="categories" role="group" aria-label="Categories">
			{#each SKILL_CATEGORIES as c (c.id)}
				{@const open = p.categories.includes(c.id)}
				{@const key = `category:${c.id}`}
				<button
					type="button"
					class="category"
					class:active={category === c.id}
					class:open
					class:holding={hold?.key === key}
					style:--hold={hold?.key === key ? progress : 0}
					data-category={open ? undefined : c.id}
					aria-pressed={category === c.id}
					onfocus={() => {
						category = c.id;
						shown = null;
					}}
					onpointerenter={() => (shown = null)}
					{...open
						? {
								onclick: () => {
									category = c.id;
									shown = null;
								}
							}
						: {
								...holdable(() => ({ category: c.id })),
								onpointerdown: (event: PointerEvent) => {
									category = c.id;
									shown = null;
									if (event.button !== 0 || locked) return;
									(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
									begin({ category: c.id });
								}
							}}
				>
					<span class="cat-name">{c.name}</span>
					<span class="cat-blurb">{open ? c.blurb : 'Hold to open: 1 point'}</span>
				</button>
			{/each}
		</div>
		<div class="points">
			<span class="big">{left}</span>
			<span class="muted">{left === 1 ? 'point' : 'points'} to spend</span>
		</div>
	</footer>

	<div class="respec">
		{#if confirming}
			<span>Put back all {pointsSpent(p)} points for {money(RESPEC_COST)}?</span>
			<button type="button" class="pill" disabled={busy || locked} onclick={respec}>Respec</button>
			<button type="button" class="pill quiet" onclick={() => (confirming = false)}>Cancel</button>
		{:else}
			<button
				type="button"
				class="pill quiet"
				disabled={locked || pointsSpent(p) === 0}
				onclick={() => (confirming = true)}
			>
				Respec ({money(RESPEC_COST)})
			</button>
		{/if}
	</div>

	{#if locked}
		<p class="muted">Nothing can be changed while you're ready to descend or underground.</p>
	{/if}
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</section>

<style>
	.skills {
		width: min(820px, 100%);
		margin: 0 auto;
		padding: 24px 16px 40px;
		display: grid;
		gap: 20px;
	}

	.level {
		display: grid;
		gap: 8px;
	}

	.numbers {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.big {
		font: 700 1.6rem var(--font-display);
		font-variant-numeric: tabular-nums;
	}

	.muted {
		color: var(--muted);
	}

	.bar {
		height: 6px;
		background: rgb(255 255 255 / 0.08);
		border: 1px solid var(--border);
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.tree {
		position: relative;
		height: 320px;
	}

	.lines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.lines path {
		fill: none;
		stroke: var(--border);
		stroke-width: 0.6;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 4 4;
	}

	.lines path.lit {
		stroke: var(--muted);
		stroke-dasharray: none;
	}

	.node,
	.connector {
		position: absolute;
		transform: translateX(-50%);
		display: grid;
		justify-items: center;
		gap: 6px;
	}

	.node {
		bottom: 8%;
	}

	.connector {
		top: 4%;
	}

	.icon {
		--size: 64px;
		position: relative;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		border: 2px solid var(--border);
		background: radial-gradient(circle, rgb(30 26 22) 0%, rgb(14 12 10) 100%);
		display: grid;
		place-items: center;
		font-size: 1.6rem;
		color: var(--text);
		touch-action: none;
		user-select: none;
	}

	/* The hold, filling round the edge. */
	.icon::after,
	.category::after {
		content: '';
		position: absolute;
		inset: -4px;
		border-radius: inherit;
		background: conic-gradient(var(--accent) calc(var(--hold, 0) * 360deg), transparent 0);
		mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
		pointer-events: none;
	}

	.icon.ranked {
		border-color: var(--accent);
	}

	.icon.closed,
	.icon.unknown {
		color: var(--muted);
	}

	.icon:focus-visible,
	.icon:hover {
		border-color: var(--text);
	}

	.slot {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 10px;
		height: 10px;
		margin: -5px;
		border-radius: 50%;
		border: 1px solid var(--muted);
		background: var(--panel);
		transform: rotate(var(--angle)) translateX(calc(var(--size) / 2 + 2px));
	}

	.slot.filled {
		background: var(--accent);
		border-color: var(--accent);
	}

	.name {
		font: 600 0.8rem var(--font-ui);
		letter-spacing: 0.06em;
		text-align: center;
		max-width: 110px;
	}

	.detail {
		min-height: 120px;
		padding: 14px 16px;
		border: 1px solid var(--border);
		background: rgb(10 9 8 / 0.6);
	}

	.detail h2 {
		margin: 0 0 8px;
		font: 600 1rem var(--font-ui);
	}

	.detail p {
		margin: 4px 0;
	}

	.bottom {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}

	.categories {
		display: flex;
		gap: 8px;
		flex: 1;
		flex-wrap: wrap;
	}

	.category {
		position: relative;
		flex: 1;
		min-width: 140px;
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: 6px;
		text-align: left;
		touch-action: none;
		user-select: none;
	}

	.category.active {
		border-color: var(--accent);
		background: rgb(255 255 255 / 0.06);
	}

	.category:not(.open) .cat-name {
		color: var(--muted);
	}

	.cat-name {
		font: 700 1rem var(--font-display);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.cat-blurb {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.points {
		display: grid;
		justify-items: center;
	}

	.respec {
		display: flex;
		gap: 10px;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.pill {
		padding: 8px 20px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		font: 600 0.85rem var(--font-ui);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.pill.quiet {
		border-color: var(--border);
	}

	.error {
		color: #e0544a;
	}

	@media (max-width: 560px) {
		.icon {
			--size: 48px;
			font-size: 1.2rem;
		}

		.name {
			font-size: 0.7rem;
			max-width: 76px;
		}
	}
</style>
