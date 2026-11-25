<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError, skills as changeSkills } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import Dialog from './Dialog.svelte';
	import {
		LEVELS,
		RESPEC_COST,
		SKILL_CATEGORIES,
		SKILLS,
		type SkillCategory,
		type SkillDef
	} from '#lib/content/progression.ts';
	import { HOLD_TIME } from '#lib/game/input/hold.ts';
	import { device } from '#lib/game/input/device.svelte.ts';
	import { pads } from '#lib/game/input/gamepad.ts';
	import type { PadButton } from '#lib/game/input/menus.ts';
	import KeyCap from './KeyCap.svelte';
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
	 * The skill tree (docs/dev/progression.md#the-skill-tree): all three categories side by side,
	 * each at the foot of its branch, its four skills tied to it by lines and rising to the
	 * connector skill (not in the game yet: a "?"). A skill's ranks fill thirds of the ring round
	 * it. Holding a skill (or a closed category) spends a point on it: the mouse or a finger held
	 * on it, Enter or Space held, or the controller's A held with it focused. Every change is the
	 * server's. The page is driven by the dashboard's menu like every other: it has none of its own,
	 * so B, LB/RB and the D-pad work here as everywhere else.
	 */
	interface Props {
		explorer: ExplorerView;
		/** Ready or underground: nothing can be changed. */
		locked?: boolean;
		/** Something happened, for its sound. */
		onsound?: (kind: 'unlock' | 'rank' | 'mastered' | 'denied') => void;
	}

	let { explorer, locked = false, onsound }: Props = $props();

	const p = $derived(progressionOf({ ...explorer.progression, firsts: [] }));
	const level = $derived(levelOf(p.xp));
	const left = $derived(pointsLeft(p));

	/** The skill whose tooltip shows (hovered or focused). */
	let tipped = $state<string | null>(null);
	let error = $state('');
	let busy = $state(false);
	let confirming = $state(false);

	const weapon = $derived(explorer.loadout.equipment.primary?.item ?? null);

	/** A hold under way: what it spends on and when it began, and how far it has got (0..1). */
	let hold = $state<{
		key: string;
		target: SpendTarget;
		start: number;
		/** The controller button holding it, if it is one: let go, the hold ends. */
		pad?: string;
	} | null>(null);
	let progress = $state(0);
	let raf = 0;

	const keyOf = (target: SpendTarget): string =>
		'category' in target ? `category:${target.category}` : `skill:${target.skill}`;

	function begin(target: SpendTarget, pad?: string): void {
		if (locked || busy) return;
		hold = { key: keyOf(target), target, start: performance.now(), pad };
		progress = 0;
		cancelAnimationFrame(raf);
		const tick = (): void => {
			if (!hold) return;
			if (hold.pad && !pads.isDown(hold.pad)) {
				end();
				return;
			}
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

	/**
	 * The controller's A held on a focused skill or closed category. The dashboard's menu sends A to
	 * the focused control first (`padpress`); taken here, it doesn't click, and the hold runs until
	 * A comes up.
	 */
	function padHolds(root: HTMLElement) {
		const press = (event: Event): void => {
			const target = event.target;
			if ((event as CustomEvent<PadButton>).detail !== 'a' || !(target instanceof HTMLElement))
				return;
			const skill = target.dataset.skill;
			const category = target.dataset.category as SkillCategory | undefined;
			if (!skill && !category) return;
			event.preventDefault();
			begin(skill ? { skill } : { category: category as SkillCategory }, 'PadA');
		};
		root.addEventListener('padpress', press);
		return () => root.removeEventListener('padpress', press);
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

	/** Where each of a category's four skills sits across its branch (0..100). */
	const COLUMNS = [20, 40, 60, 80];
	/** How far up the branch the middle two sit above the outer two, so the row arcs. */
	const LIFT = [0, 5, 5, 0];
	/** Heights in the branch (0..100, top down): the connector, the skills, the category. The tree grows up from the bottom: room above for skills to come. */
	const ROW = { connector: 42, skill: 72, category: 93 };
	/** The rank ring: its radius (in the icon's 100-unit box), and the gap between its thirds. */
	const RING_R = 46;
	const RING = 2 * Math.PI * RING_R;
	const THIRD = RING / 3 - 14;

	/** From the top of a skill's ring up to the connector. */
	const upPath = (x: number, y: number): string =>
		`M ${x} ${y - 6} C ${x} ${y - 16}, 50 ${ROW.connector + 14}, 50 ${ROW.connector + 5}`;
	/** From under a skill's name down to its category. */
	const downPath = (x: number, y: number): string =>
		`M ${x} ${y + 10} C ${x} ${y + 16}, 50 ${ROW.category - 16}, 50 ${ROW.category - 8}`;
</script>

{#snippet holdHint()}
	{#if device.kind === 'pad'}Hold <KeyCap code="PadA" />{:else}Hold{/if}
{/snippet}

<section class="skills" {@attach padHolds}>
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
			<span class="points"><strong>{left}</strong> {left === 1 ? 'point' : 'points'} to spend</span>
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

	<div class="branches">
		{#each SKILL_CATEGORIES as c (c.id)}
			{@const open = p.categories.includes(c.id)}
			{@const tree = SKILLS.filter((s) => s.category === c.id)}
			{@const catKey = `category:${c.id}`}
			<div class="branch" class:open aria-label="{c.name} skills" role="group">
				<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					{#each COLUMNS as x, i (x)}
						<path class="up" d={upPath(x, ROW.skill - LIFT[i])} />
						<path class="down" class:lit={open} d={downPath(x, ROW.skill - LIFT[i])} />
					{/each}
				</svg>

				<div class="spot" style:left="50%" style:top="{ROW.connector}%">
					<span class="icon unknown" title="Not in the game yet">?</span>
				</div>

				{#each tree as skill, i (skill.id)}
					{@const rank = p.skills[skill.id] ?? 0}
					{@const key = `skill:${skill.id}`}
					<div class="spot" style:left="{COLUMNS[i]}%" style:top="{ROW.skill - LIFT[i]}%">
						<button
							type="button"
							class="icon"
							class:closed={!open}
							style:--hold={hold?.key === key ? progress : 0}
							data-skill={skill.id}
							aria-label={open
								? `${skill.name}, rank ${rank} of ${MAX_RANK}. Hold to spend a point.`
								: `A ${c.name} skill, not yet open`}
							aria-disabled={locked}
							aria-describedby={open && tipped === skill.id ? 'skill-tip' : undefined}
							onpointerenter={() => (tipped = skill.id)}
							onpointerleave={() => tipped === skill.id && (tipped = null)}
							onfocus={() => (tipped = skill.id)}
							{...holdable(() => ({ skill: skill.id }))}
							onblur={() => {
								end();
								if (tipped === skill.id) tipped = null;
							}}
						>
							<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
								{#each [0, 1, 2] as third (third)}
									<circle
										cx="50"
										cy="50"
										r={RING_R}
										class:filled={third < rank}
										stroke-dasharray="{THIRD} {RING}"
										transform="rotate({-90 + 120 * third + 8} 50 50)"
									/>
								{/each}
							</svg>
							<span class="glyph">{open ? skill.icon : '?'}</span>
						</button>
						<span class="name">{open ? skill.name : '?'}</span>
						{#if open && tipped === skill.id}
							{@const l = lines(skill)}
							<div
								class="tip"
								id="skill-tip"
								role="tooltip"
								class:left={i === 3}
								class:right={i === 0}
							>
								<h3>{skill.name} <span class="muted">Rank {rank} of {MAX_RANK}</span></h3>
								<p>{summaryAt(skill, Math.max(rank, 1))}</p>
								{#if rank > 0}
									<p><span class="muted">Now:</span> <strong>{l.now}</strong></p>
									<p class="muted">Without it: {l.base}</p>
								{:else}
									<p><span class="muted">Now:</span> {l.base}</p>
								{/if}
								{#if l.next}
									<p class="next">
										<span class="muted">Rank {rank + 1}:</span>
										{summaryAt(skill, rank + 1)}<br /><strong>{l.next}</strong>
									</p>
								{:else}
									<p class="muted">At its top rank.</p>
								{/if}
								{#if rank < MAX_RANK && !locked}<p class="muted hint">
										{@render holdHint()} to spend a point.
									</p>{/if}
							</div>
						{/if}
					</div>
				{/each}

				<div class="spot category-spot" style:left="50%" style:top="{ROW.category}%">
					<button
						type="button"
						class="category"
						class:open
						style:--hold={hold?.key === catKey ? progress : 0}
						data-category={open ? undefined : c.id}
						aria-label={open ? `${c.name}: open` : `${c.name}: hold to open for a point`}
						aria-disabled={locked && !open}
						aria-describedby={tipped === catKey ? 'category-tip' : undefined}
						onpointerenter={() => (tipped = catKey)}
						onpointerleave={() => tipped === catKey && (tipped = null)}
						onfocus={() => (tipped = catKey)}
						{...holdable(() => ({ category: c.id }))}
						onblur={() => {
							end();
							if (tipped === catKey) tipped = null;
						}}
					>
						<span class="cat-name">{c.name}</span>
					</button>
					{#if tipped === catKey}
						<div class="tip" id="category-tip" role="tooltip">
							<h3>{c.name} <span class="muted">{c.blurb}</span></h3>
							<p>{c.pitch}</p>
							{#if open}
								<p class="muted">Open: each of its skills takes a point a rank.</p>
							{:else}
								<p class="muted hint">{@render holdHint()} to open it for a point.</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<div class="respec">
		<button
			type="button"
			class="pill quiet"
			disabled={locked || busy || pointsSpent(p) === 0 || explorer.money < RESPEC_COST}
			title={explorer.money < RESPEC_COST ? `A respec costs ${money(RESPEC_COST)}` : undefined}
			onclick={() => (confirming = true)}
		>
			Respec ${RESPEC_COST}
		</button>
	</div>

	{#if confirming}
		<Dialog title="Respec" onclose={() => (confirming = false)}>
			<p>
				Put back all {pointsSpent(p)} points for {money(RESPEC_COST)}? Your experience and level
				stay.
			</p>
			{#snippet footer()}
				<button type="button" onclick={() => (confirming = false)}>Cancel</button>
				<button type="button" class="primary" disabled={busy || locked} onclick={respec}
					>Respec</button
				>
			{/snippet}
		</Dialog>
	{/if}

	{#if locked}
		<p class="muted">Nothing can be changed while you're ready to descend or underground.</p>
	{/if}
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</section>

<style>
	/* The page fills the window's height, the branches taking what the rest leaves. */
	.skills {
		flex: 1;
		width: min(1240px, 100%);
		margin: 0 auto;
		padding: 24px 16px 72px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.level {
		display: grid;
		gap: 8px;
	}

	.numbers {
		display: flex;
		align-items: baseline;
		gap: 16px;
		flex-wrap: wrap;
	}

	.numbers .points {
		margin-left: auto;
	}

	.points strong {
		font: 700 1.3rem var(--font-display);
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

	.branches {
		display: grid;
		flex: 1;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
	}

	.branch {
		position: relative;
		min-height: 480px;
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
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
	}

	.lines .up {
		stroke-dasharray: 6 6;
	}

	.lines .down.lit {
		stroke: var(--accent);
	}

	.spot {
		position: absolute;
		transform: translate(-50%, -50%);
		display: grid;
		justify-items: center;
		gap: 4px;
	}

	/*
	 * Each spot's transform makes it a stacking context, so a tooltip's z-index counts only inside
	 * its own spot: the spot showing one is lifted over its neighbours (and their lines and names).
	 */
	.spot:has(.tip) {
		z-index: 10;
	}

	/* A skill's name hangs below its icon without moving the icon off its line. */
	.spot:has(.name) {
		transform: translate(-50%, calc(-1 * var(--size, 56px) / 2));
	}

	.icon {
		--size: 56px;
		position: relative;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		border: none;
		padding: 0;
		background: radial-gradient(circle, rgb(30 26 22) 0%, rgb(14 12 10) 70%);
		display: grid;
		place-items: center;
		font-size: 1.4rem;
		color: var(--text);
		touch-action: none;
		user-select: none;
	}

	.icon.unknown {
		border: 2px dashed var(--border);
		color: var(--muted);
	}

	.icon.closed {
		color: var(--muted);
	}

	.ring {
		position: absolute;
		inset: -6px;
		width: calc(100% + 12px);
		height: calc(100% + 12px);
		overflow: visible;
	}

	.ring circle {
		fill: none;
		stroke: rgb(255 255 255 / 0.12);
		stroke-width: 6;
		stroke-linecap: round;
	}

	.ring circle.filled {
		stroke: var(--accent);
	}

	.icon:hover .ring circle:not(.filled),
	.icon:focus-visible .ring circle:not(.filled) {
		stroke: rgb(255 255 255 / 0.3);
	}

	/* The hold, filling the face of the button. */
	.icon::after,
	.category::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: conic-gradient(rgb(0 129 157 / 0.45) calc(var(--hold, 0) * 360deg), transparent 0);
		pointer-events: none;
	}

	.glyph {
		position: relative;
	}

	.name {
		font: 600 0.75rem var(--font-ui);
		letter-spacing: 0.04em;
		text-align: center;
		width: 90px;
	}

	.category {
		position: relative;
		display: grid;
		place-items: center;
		width: 84px;
		height: 84px;
		padding: 0;
		border: 2px solid var(--border);
		border-radius: 50%;
		background: var(--panel);
		touch-action: none;
		user-select: none;
		white-space: nowrap;
	}

	.category.open {
		border-color: var(--accent);
	}

	.category:not(.open) .cat-name {
		color: var(--muted);
	}

	.category:hover,
	.category:focus-visible {
		border-color: var(--text);
	}

	.cat-name {
		font: 700 1rem var(--font-display);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	/* A skill's tooltip: above its icon, over the lines and the connector. */
	.tip {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 5;
		width: 280px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: rgb(8 7 6 / 0.97);
		text-align: left;
		pointer-events: none;
		font-size: 0.85rem;
	}

	.tip.right {
		left: 0;
		transform: none;
	}

	.tip.left {
		left: auto;
		right: 0;
		transform: none;
	}

	.tip h3 {
		margin: 0 0 6px;
		font: 700 0.95rem var(--font-ui);
	}

	.tip p {
		margin: 4px 0;
	}

	.tip .next {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}

	.tip .hint {
		font-size: 0.75rem;
	}

	.respec {
		display: flex;
		gap: 10px;
		align-items: center;
		justify-content: flex-start;
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

	@media (max-width: 1000px) {
		.branches {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 480px) {
		.icon {
			--size: 44px;
			font-size: 1.1rem;
		}

		.name {
			width: 70px;
			font-size: 0.68rem;
		}
	}
</style>
