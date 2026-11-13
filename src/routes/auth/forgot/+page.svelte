<script lang="ts">
	import { resolve } from '$app/paths';
	import { api, ApiError } from '#lib/account/account.svelte.ts';
	import AuthPage from '#lib/ui/AuthPage.svelte';

	let email = $state('');
	let error = $state('');
	let sent = $state(false);
	let busy = $state(false);

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			await api('/api/auth/forgot', 'POST', { email });
			sent = true;
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
		}
		busy = false;
	}
</script>

<AuthPage title="Forgot your password" onsubmit={submit}>
	{#if sent}
		<p role="status">
			If {email} has an account, we've sent it a link to choose a new password. It works for an hour.
			Check your spam folder if it doesn't arrive.
		</p>
	{:else}
		<p class="muted">Enter your account's email and we'll send you a link to choose a new one.</p>
		<label>
			<span>Email</span>
			<input type="email" autocomplete="email" required bind:value={email} />
		</label>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
		<button type="submit" class="primary" disabled={busy}>Send the link</button>
	{/if}
	<p class="muted"><a href={resolve('/auth/sign-in')}>Back to sign in</a></p>
</AuthPage>
