<script lang="ts">
	import { session } from '#lib/account/account.svelte.ts';
	import Afflictions from '#lib/ui/Afflictions.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
</script>

<section class="card">
	{#if explorer}
		<Afflictions progress={explorer.afflictions} />
	{:else}
		<p class="muted">Loading...</p>
	{/if}
</section>

<style>
	.card {
		padding: 20px;
		background: rgb(10 9 8 / 0.82);
		border: 1px solid var(--border);
	}

	.muted {
		margin: 0;
		color: var(--muted);
	}
</style>
