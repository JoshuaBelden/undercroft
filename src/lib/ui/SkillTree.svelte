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
	 * The skill tree (docs/dev/progression.md#the-skill-tree): all three categories side by side,
	 * each at the foot of its branch, its four skills tied to it by lines and rising to the
	 * connector skill (not in the game yet: a "?"). A skill's ranks fill thirds of the ring round
	 * it. Holding a skill (or a closed category) spends a point on it: the mouse or a finger held
	 * on it, Enter or Space held, or the controller's X held with it focused. Every change is the
	 * server's.
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

	/** What the panel shows (focused or hovered): a skill, or a category. */
	let shown = $state<{ skill: string } | { category: SkillCategory } | null>(null);
	let error = $state('');
	let busy = $state(false);
	let confirming = $state(false);

	const shownSkill = $derived.by(() => {
		const s = shown;
		return s && 'skill' in s ? (SKILLS.find((k) => k.id === s.skill) ?? null) : null;
	});
	const shownCategory = $derived.by(() => {
		const s = shown;
		return s && 'category' in s
			? (SKILL_CATEGORIES.find((c) => c.id === s.category) ?? null)
			: null;
	});
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

	/** Where each of a category's four skills sits across its branch (0..100). */
	const COLUMNS = [12.5, 37.5, 62.5, 87.5];
	/** Heights in the branch (0..100, top down): the connector, the skills, the category. */
	const ROW = { connector: 9, skill: 50, category: 92 };
	/** The rank ring: its radius (in the icon's 100-unit box), and the gap between its thirds. */
	const RING_R = 46;
	const RING = 2 * Math.PI * RING_R;
	const THIRD = RING / 3 - 14;

	/** From the top of a skill's ring up to the connector. */
	const upPath = (x: number): string =>
		`M ${x} ${ROW.skill - 9} C ${x} ${ROW.skill - 26}, 50 ${ROW.connector + 20}, 50 ${ROW.connector + 7}`;
	/** From under a skill's name down to its category. */
	const downPath = (x: number): string =>
		`M ${x} ${ROW.skill + 17} C ${x} ${ROW.skill + 30}, 50 ${ROW.category - 22}, 50 ${ROW.category - 6}`;
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
					{#each COLUMNS as x (x)}
						<path class="up" d={upPath(x)} />
						<path class="down" class:lit={open} d={downPath(x)} />
					{/each}
				</svg>

				<div class="spot" style:left="50%" style:top="{ROW.connector}%">
					<span class="icon unknown" title="Not in the game yet">?</span>
				</div>

				{#each tree as skill, i (skill.id)}
					{@const rank = p.skills[skill.id] ?? 0}
					{@const key = `skill:${skill.id}`}
					<div class="spot" style:left="{COLUMNS[i]}%" style:top="{ROW.skill}%">
						<button
							type="button"
							class="icon"
							class:closed={!open}
							style:--hold={hold?.key === key ? progress : 0}
							data-skill={skill.id}
							aria-label={open
								? `${skill.name}, rank ${rank} of ${MAX_RANK}. Hold to spend a point.`
								: `A ${c.name} skill, not yet open`}
							disabled={locked}
							onfocus={() => (shown = { skill: skill.id })}
							onpointerenter={() => (shown = { skill: skill.id })}
							{...holdable(() => ({ skill: skill.id }))}
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
						disabled={locked && !open}
						onfocus={() => (shown = { category: c.id })}
						onpointerenter={() => (shown = { category: c.id })}
						{...holdable(() => ({ category: c.id }))}
					>
						<span class="cat-name">{c.name}</span>
						<span class="cat-blurb">{open ? c.blurb : 'Hold to open: 1 point'}</span>
					</button>
				</div>
			</div>
		{/each}
	</div>

	<div class="detail" aria-live="polite">
		{#if shownSkill && p.categories.includes(shownSkill.category)}
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
		{:else if shownCategory || shownSkill}
			{@const c = shownCategory ?? SKILL_CATEGORIES.find((k) => k.id === shownSkill?.category)}
			<h2>{c?.name}: {c?.blurb}</h2>
			{#if c && p.categories.includes(c.id)}
				<p>Open. Hold one of its skills to raise it a rank.</p>
			{:else}
				<p>Hold it to open it for a point, and its four skills show.</p>
			{/if}
		{:else}
			<p class="muted">Point at a skill to see what it does. Hold it to spend a point.</p>
		{/if}
	</div>

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
		width: min(1240px, 100%);
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
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
	}

	.branch {
		position: relative;
		height: 400px;
		border: 1px solid var(--border);
		background: rgb(10 9 8 / 0.4);
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
		justify-items: center;
		gap: 2px;
		padding: 8px 18px;
		border: 2px solid var(--border);
		border-radius: 6px;
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

	.cat-blurb {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.detail {
		min-height: 110px;
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
