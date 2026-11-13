<script lang="ts">
	import { resolve } from '$app/paths';
	import { api, ApiError } from '#lib/account/account.svelte.ts';
	import AuthPage from '#lib/ui/AuthPage.svelte';

	let code = $state('');
	let error = $state('');
	/** The sign-in ran out or was refused: it has to start again. */
	let restart = $state(false);
	let busy = $state(false);

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			await api('/api/auth/mfa', 'POST', { code });
			// A full load, so the server sees the new session.
			location.href = resolve('/(hub)');
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
			restart = caught instanceof ApiError && caught.status === 410;
			code = '';
			busy = false;
		}
	}
</script>

<AuthPage title="Two-step sign-in" onsubmit={submit}>
	<p class="muted">
		Enter the code from your authenticator app. Lost your phone? Enter one of your recovery codes
		instead.
	</p>
	<label>
		<span>Code</span>
		<input
			type="text"
			inputmode="text"
			autocomplete="one-time-code"
			autocapitalize="off"
			spellcheck="false"
			required
			disabled={restart}
			bind:value={code}
		/>
	</label>
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
	{#if restart}
		<p class="muted"><a href={resolve('/auth/sign-in')}>Sign in again</a></p>
	{:else}
		<button type="submit" class="primary" disabled={busy}>Sign in</button>
		<p class="muted"><a href={resolve('/auth/sign-in')}>Cancel</a></p>
	{/if}
</AuthPage>
