<script lang="ts">
	import { resolve } from '$app/paths';
	import FeedbackList from '#lib/ui/FeedbackList.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Feedback · Undercroft Admin</title></svelte:head>

<h1>Feedback</h1>

<nav class="toolbar" aria-label="View">
	<a href={resolve('/feedback')} aria-current={!data.archived ? 'page' : undefined}>Inbox</a>
	<a href="{resolve('/feedback')}?archived=1" aria-current={data.archived ? 'page' : undefined}
		>Archive</a
	>
</nav>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

<FeedbackList feedback={data.feedback} actions />

<style>
	nav a[aria-current='page'] {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
</style>
