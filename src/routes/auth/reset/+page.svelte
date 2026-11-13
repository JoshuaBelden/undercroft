<script lang="ts">
	import { resolve } from '$app/paths';
	import { ACCOUNT } from '#lib/content/account.ts';
	import { api, ApiError } from '#lib/account/account.svelte.ts';
	import AuthPage from '#lib/ui/AuthPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let password = $state('');
	let again = $state('');
	let error = $state('');
	let done = $state(false);
	let busy = $state(false);

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		if (password !== again) {
			error = "The two passwords don't match";
			return;
		}
		busy = true;
		error = '';
		try {
			await api('/api/auth/reset', 'POST', { token: data.token, password });
			done = true;
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
		}
		busy = false;
	}
</script>

<AuthPage title="Choose a new password" onsubmit={submit}>
	{#if done}
		<p role="status">
			Your password is changed, and every browser that was signed in has been signed out.
		</p>
		<p class="muted"><a href={resolve('/auth/sign-in')}>Sign in with it</a></p>
	{:else if !data.valid}
		<p class="error" role="alert">This link has expired or was already used.</p>
		<p class="muted"><a href={resolve('/auth/forgot')}>Ask for a new one</a></p>
	{:else}
		<label>
			<span>New password</span>
			<input
				type="password"
				autocomplete="new-password"
				minlength={ACCOUNT.passwordMin}
				required
				bind:value={password}
			/>
		</label>
		<label>
			<span>Again</span>
			<input
				type="password"
				autocomplete="new-password"
				minlength={ACCOUNT.passwordMin}
				required
				bind:value={again}
			/>
		</label>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
		<button type="submit" class="primary" disabled={busy}>Save the password</button>
	{/if}
</AuthPage>
