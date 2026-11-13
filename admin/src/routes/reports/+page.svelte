<script lang="ts">
	import { resolve } from '$app/paths';
	import { REPORT_STATUSES } from '#lib/content.ts';
	import ReportList from '#lib/ui/ReportList.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Bug reports · Undercroft Admin</title></svelte:head>

<h1>Bug reports</h1>

{#if !data.github}
	<p class="muted">
		<code>GITHUB_TOKEN</code> isn't set: reports are kept here but not filed on GitHub.
	</p>
{/if}

<nav class="toolbar" aria-label="Filter">
	<a href={resolve('/reports')} aria-current={!data.status && !data.errorId ? 'page' : undefined}
		>All</a
	>
	{#each Object.entries(REPORT_STATUSES) as [status, label] (status)}
		<a
			href="{resolve('/reports')}?status={status}"
			aria-current={data.status === status ? 'page' : undefined}>{label}</a
		>
	{/each}
	{#if data.errorId}<span class="badge info">About one crash</span>{/if}
</nav>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if form && 'notice' in form}<p class="notice" role="status">{form.notice}</p>{/if}

<ReportList reports={data.reports} canFile={data.github} />

<style>
	nav a[aria-current='page'] {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
</style>
