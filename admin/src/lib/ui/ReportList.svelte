<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		REPORT_STATUSES,
		type CrashInfo,
		type Diagnostics,
		type ReportStatus
	} from '#lib/content.ts';
	import { formatTime } from '#lib/format.ts';
	import Action from './Action.svelte';

	/** Bug reports, each opening to its whole text and details: on its page, and under a member. */
	interface Props {
		reports: {
			_id: string;
			account: string;
			gamerTag: string;
			title: string;
			description: string;
			steps: string;
			diagnostics?: Diagnostics;
			crash?: CrashInfo;
			errorId?: string;
			status: ReportStatus;
			issue?: { number: number; url: string };
			failure?: string;
			createdAt: Date;
		}[];
		/** Offer to file the ones that aren't (only where the page has the `file` action). */
		canFile?: boolean;
		/** Leave out who sent it (under a member, it is always them). */
		hideSender?: boolean;
	}

	let { reports, canFile = false, hideSender = false }: Props = $props();

	const BADGE: Record<ReportStatus, string> = { pending: '', filed: 'good', failed: 'warn' };
</script>

{#if reports.length === 0}
	<p class="muted">No reports.</p>
{:else}
	<div class="list">
		{#each reports as report (report._id)}
			<details class="panel">
				<summary>
					<span class="badge {BADGE[report.status]}">{REPORT_STATUSES[report.status]}</span>
					{#if report.crash}<span class="badge warn">Crash</span>{/if}
					<strong>{report.title}</strong>
					<span class="muted">
						{#if !hideSender}{report.gamerTag} ·{/if}
						{formatTime(report.createdAt)}
					</span>
				</summary>
				<div class="body">
					<p class="meta">
						{#if !hideSender}
							From <a href={resolve('/members/[id]', { id: report.account })}>{report.gamerTag}</a>
							·
						{/if}
						Report <code>{report._id}</code>
						{#if report.issue}
							· <a href={report.issue.url} target="_blank" rel="external noreferrer"
								>#{report.issue.number}</a
							>
						{/if}
						{#if report.errorId}
							· <a href="{resolve('/reports')}?error={report.errorId}">Same crash</a>
						{/if}
					</p>
					<h3>What happened</h3>
					<p class="text">{report.description}</p>
					{#if report.steps}
						<h3>How to make it happen</h3>
						<p class="text">{report.steps}</p>
					{/if}
					{#if report.crash}
						<h3>Error ({report.crash.source})</h3>
						<pre>{report.crash.message}{report.crash.stack ? `\n${report.crash.stack}` : ''}</pre>
					{/if}
					{#if report.diagnostics}
						<h3>Details</h3>
						<pre>{JSON.stringify({ ...report.diagnostics, console: undefined }, null, 2)}</pre>
						{#if report.diagnostics.console?.length}
							<h3>Console</h3>
							<pre>{report.diagnostics.console.join('\n')}</pre>
						{/if}
					{/if}
					{#if report.failure}<p class="error">Filing failed: {report.failure}</p>{/if}
					{#if canFile && report.status !== 'filed'}
						<Action action="file" label="File on GitHub" primary fields={{ id: report._id }} />
					{/if}
				</div>
			</details>
		{/each}
	</div>
{/if}

<style>
	.list {
		display: grid;
		gap: 8px;
	}

	details.panel {
		padding: 12px 16px;
	}

	summary {
		cursor: pointer;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.body {
		margin-top: 12px;
		display: grid;
		gap: 8px;
	}

	h3 {
		margin: 6px 0 0;
		font-size: 14px;
		color: var(--muted);
	}

	.text {
		margin: 0;
		white-space: pre-wrap;
	}

	.meta {
		margin: 0;
		color: var(--muted);
	}
</style>
