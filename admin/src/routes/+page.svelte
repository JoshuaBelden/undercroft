<script lang="ts">
	import { resolve } from '$app/paths';
	import { ago, duration } from '#lib/format.ts';
	import BarChart from '#lib/ui/BarChart.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ACCENT = '#00819d';
	const GOLD = '#b08a1e';

	const OUTCOMES: Record<string, string> = {
		extracted: 'Climbed out',
		banished: 'Banished it',
		died: 'Died',
		lost: 'Out of time',
		abandoned: 'Abandoned',
		left: 'Left or dropped'
	};

	const runs = $derived(data.runs);
	const extractRate = $derived(
		runs.runs
			? Math.round(
					(((runs.byOutcome.extracted ?? 0) + (runs.byOutcome.banished ?? 0)) / runs.runs) * 100
				)
			: 0
	);
	const one = (n: number): string => (Math.round(n * 10) / 10).toString();
</script>

<svelte:head><title>Dashboard · Undercroft Admin</title></svelte:head>

<h1>Dashboard</h1>

<section class="tiles" aria-label="Now">
	<div class="panel tile">
		<span class="label">Game server</span>
		{#if data.status}
			<span class="big">{data.status.online}</span>
			<span class="muted">
				online · {data.status.underground} underground in {data.status.expeditions}
				{data.status.expeditions === 1 ? 'expedition' : 'expeditions'}
			</span>
			<span class="muted small">
				{data.status.version} · up {ago(data.status.startedAt).replace(' ago', '')} · {data.status
					.memoryMb} MB
			</span>
		{:else}
			<span class="big down">Down</span>
			<span class="muted">Last heard {ago(data.lastStatus)}</span>
		{/if}
	</div>
	<div class="panel tile">
		<span class="label">Members</span>
		<span class="big">{data.members.total}</span>
		<span class="muted">{data.members.daily} played today · {data.members.weekly} this week</span>
		{#if data.members.suspended}<span class="muted small">{data.members.suspended} suspended</span
			>{/if}
	</div>
	<div class="panel tile">
		<span class="label">Needs an answer</span>
		<ul class="todo">
			<li><a href={resolve('/ideas')}>{data.todo.ideas} ideas</a> waiting for review</li>
			<li><a href={resolve('/feedback')}>{data.todo.feedback} feedback</a> unread</li>
			<li>
				<a href="{resolve('/reports')}?status=failed">{data.todo.failed} reports</a> not filed
			</li>
			<li><a href={resolve('/crashes')}>{data.todo.crashes} crashes</a> in the last day</li>
		</ul>
	</div>
</section>

<nav class="toolbar" aria-label="Period">
	<span class="muted">Last</span>
	{#each data.choices as choice (choice)}
		<a href="{resolve('/')}?days={choice}" aria-current={data.days === choice ? 'page' : undefined}
			>{choice} days</a
		>
	{/each}
</nav>

<section class="tiles" aria-label="Runs">
	<div class="panel tile">
		<span class="label">Runs</span>
		<span class="big">{runs.runs}</span>
		<span class="muted">by {runs.players} explorers · {runs.solo} solo, {runs.coop} co-op</span>
	</div>
	<div class="panel tile">
		<span class="label">Got out</span>
		<span class="big">{extractRate}%</span>
		<span class="muted">climbed out or banished it</span>
	</div>
	<div class="panel tile">
		<span class="label">A typical run</span>
		<span class="big">{duration(runs.avgSeconds)}</span>
		<span class="muted">
			level {one(runs.avgDeepest)} · {one(runs.avgKills)} kills · {one(runs.avgCrates)} crates · {Math.round(
				runs.avgCarried
			)} carried out
		</span>
		{#if runs.avgManifestedAfter !== null}
			<span class="muted small">It manifests after {duration(runs.avgManifestedAfter)}</span>
		{/if}
	</div>
</section>

<div class="charts">
	<section class="panel">
		<BarChart
			title="Runs per day"
			rows={data.runChart}
			series={[
				{ key: 'runs', label: 'Runs', color: ACCENT },
				{ key: 'extracted', label: 'Climbed out', color: GOLD }
			]}
		/>
	</section>
	<section class="panel">
		<BarChart
			title="Explorers who played, per day"
			rows={data.playerChart}
			series={[{ key: 'players', label: 'Explorers', color: ACCENT }]}
		/>
	</section>
	<section class="panel">
		<BarChart
			title="Sign-ups per day"
			rows={data.signupChart}
			series={[{ key: 'signups', label: 'Sign-ups', color: ACCENT }]}
		/>
	</section>
	<section class="panel">
		<h2>How runs ended</h2>
		{#if runs.runs === 0}
			<p class="muted">No runs yet.</p>
		{:else}
			<table>
				<tbody>
					{#each Object.entries(OUTCOMES) as [outcome, label] (outcome)}
						<tr>
							<td>{label}</td>
							<td class="num">{runs.byOutcome[outcome] ?? 0}</td>
							<td class="num muted"
								>{Math.round(((runs.byOutcome[outcome] ?? 0) / runs.runs) * 100)}%</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
		<h2>Money</h2>
		{#if data.money.length === 0}
			<p class="muted">Nothing bought or sold.</p>
		{:else}
			<table>
				<tbody>
					{#each data.money as line (line.kind)}
						<tr>
							<td>{line.kind}</td>
							<td class="num">{line.money > 0 ? `+${line.money}` : line.money}</td>
							<td class="num muted">{line.count}×</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</div>

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 16px;
		margin-bottom: 16px;
	}

	.tile {
		display: grid;
		gap: 4px;
		align-content: start;
	}

	.label {
		color: var(--muted);
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.big {
		font-family: var(--font-display);
		font-size: 40px;
		font-weight: 600;
		line-height: 1.1;
	}

	.down {
		color: #f0a0a0;
	}

	.small {
		font-size: 13px;
	}

	.todo {
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 4px;
	}

	nav a[aria-current='page'] {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}

	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
		gap: 16px;
	}

	h2 {
		margin: 0 0 8px;
		font-size: 18px;
	}

	h2:not(:first-child) {
		margin-top: 18px;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 720px) {
		.charts {
			grid-template-columns: 1fr;
		}
	}
</style>
