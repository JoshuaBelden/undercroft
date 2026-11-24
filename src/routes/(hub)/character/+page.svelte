<script lang="ts">
	import { ApiError, saveLook, session } from '#lib/account/account.svelte.ts';
	import type { Look } from '#lib/shared/player/look.ts';
	import CharacterScreen from '#lib/ui/CharacterScreen.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
	let error = $state('');

	/** The new look shows at once; what the server says is what stays. */
	function change(look: Look): void {
		error = '';
		void saveLook(look).catch((e: unknown) => {
			error = e instanceof ApiError ? e.message : 'Could not save your look';
		});
	}
</script>

{#if explorer}
	<CharacterScreen look={explorer.look} onchange={change} {error} />
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
