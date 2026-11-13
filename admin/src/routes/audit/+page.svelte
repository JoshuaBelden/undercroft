<script lang="ts">
	import AuditTable from '#lib/ui/AuditTable.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Audit log · Undercroft Admin</title></svelte:head>

<h1>Audit log</h1>
<p class="muted">Every change made from the admin app or with <code>pnpm admin:grant</code>.</p>
<AuditTable entries={data.entries} />
