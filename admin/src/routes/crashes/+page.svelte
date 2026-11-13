<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatTime } from '#lib/format.ts';
	import Action from '#lib/ui/Action.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const SOURCES = { client: 'Browser', web: 'Site server', game: 'Game server' } as const;
</script>

<svelte:head><title>Crashes · Undercroft Admin</title></svelte:head>

<h1>Crashes</h1>
<p class="muted">
	Game and site server errors are all here. Browser errors only appear when a player sends a report
	about one.
</p>

<nav class="toolbar" aria-label="Filter">
	<a href={resolve('/crashes')} aria-current={!data.source ? 'page' : undefined}>All</a>
	{#each Object.entries(SOURCES) as [source, label] (source)}
		<a
			href="{resolve('/crashes')}?source={source}"
			aria-current={data.source === source ? 'page' : undefined}>{label}</a
		>
	{/each}
</nav>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if form && 'notice' in form}<p class="notice" role="status">{form.notice}</p>{/if}

{#if data.crashes.length === 0}
	<p class="muted">Nothing has crashed. Yet.</p>
{:else}
	<div class="list">
		{#each data.crashes as crash (crash._id)}
			<details class="panel">
				<summary>
					<span class="badge">{SOURCES[crash.source]}</span>
					<strong class="message">{crash.message}</strong>
					<span class="badge warn">{crash.count}×</span>
					{#if crash.reports > 0}<span class="badge info">{crash.reports} reports</span>{/if}
					{#if crash.issue}<span class="badge good">#{crash.issue.number}</span>{/if}
					<span class="muted">last {formatTime(crash.lastSeen)}</span>
				</summary>
				<div class="body">
					<p class="muted">
						First seen {formatTime(crash.firstSeen)} · versions {crash.versions.join(', ')} ·
						<code>{crash._id}</code>
					</p>
					{#if crash.stack}<pre>{crash.stack}</pre>{/if}
					<div class="toolbar">
						{#if crash.reports > 0}
							<a href="{resolve('/reports')}?error={crash._id}">Read the reports</a>
						{/if}
						{#if crash.issue}
							<a href={crash.issue.url} target="_blank" rel="external noreferrer"
								>Issue #{crash.issue.number}</a
							>
						{:else if data.github}
							<Action action="file" label="File on GitHub" primary fields={{ id: crash._id }} />
						{/if}
					</div>
				</div>
			</details>
		{/each}
	</div>
{/if}

<style>
	nav a[aria-current='page'] {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}

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

	.message {
		font-family: var(--font-mono);
		font-size: 13px;
		word-break: break-word;
	}

	.body {
		margin-top: 12px;
		display: grid;
		gap: 10px;
	}
</style>
