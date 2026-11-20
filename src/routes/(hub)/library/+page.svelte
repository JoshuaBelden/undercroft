<script lang="ts">
	import { markSeen, session } from '#lib/account/account.svelte.ts';
	import Library from '#lib/ui/Library.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
</script>

{#if explorer}
	<Library {explorer} onseen={(item) => void markSeen([item]).catch(() => {})} />
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
