<script lang="ts">
	import { ApiError, saveLook, session } from '#lib/account/account.svelte.ts';
	import { send } from '#lib/game/net/connection.svelte.ts';
	import type { Look } from '#lib/shared/player/look.ts';
	import CharacterScreen from '#lib/ui/CharacterScreen.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
	/** The look being tried on: shown at once, saved and shown to the party only on Apply. */
	let draft = $state<Look | null>(null);
	let error = $state('');
	let saving = $state(false);

	const look = $derived(draft ?? explorer?.look ?? null);
	const changed = $derived(
		!!draft && !!explorer && JSON.stringify(draft) !== JSON.stringify(explorer.look)
	);

	/** Save the look, then have the game server read it again so the party sees it. */
	async function apply(): Promise<void> {
		if (!draft) return;
		error = '';
		saving = true;
		try {
			await saveLook(draft);
			send({ type: 'profile' });
			draft = null;
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not save your look';
		} finally {
			saving = false;
		}
	}
</script>

{#if explorer && look}
	<CharacterScreen
		{look}
		{error}
		{changed}
		{saving}
		onchange={(next) => (draft = next)}
		onapply={() => void apply()}
		onrevert={() => (draft = null)}
	/>
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
