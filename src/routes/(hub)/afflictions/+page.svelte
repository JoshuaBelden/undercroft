<script lang="ts">
	import { session } from '#lib/account/account.svelte.ts';
	import Afflictions from '#lib/ui/Afflictions.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
</script>

{#if explorer}
	<Afflictions progress={explorer.afflictions} />
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
