<script lang="ts">
	import { resolve } from '$app/paths';
	import { ACCOUNT } from '#lib/content/account.ts';
	import { api, ApiError } from '#lib/account/account.svelte.ts';
	import AuthPage from '#lib/ui/AuthPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The Discord name is only where it starts: the player edits it.
	let gamerTag = $derived(data.suggested);
	let error = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			await api('/api/auth/discord-signup', 'POST', { gamerTag });
			location.href = resolve('/(hub)');
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
			busy = false;
		}
	}
</script>

<AuthPage title="Choose your gamer tag" onsubmit={submit}>
	<p class="muted">
		Your account will use {data.email}, from Discord. The gamer tag is the name other players see;
		you can change it later.
	</p>
	<label>
		<span>Gamer tag</span>
		<input
			type="text"
			autocomplete="nickname"
			minlength={ACCOUNT.tagMin}
			maxlength={ACCOUNT.tagMax}
			required
			bind:value={gamerTag}
		/>
	</label>
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
	<button type="submit" class="primary" disabled={busy}>Create account</button>
	<p class="muted"><a href={resolve('/auth/sign-in')}>Cancel</a></p>
</AuthPage>
