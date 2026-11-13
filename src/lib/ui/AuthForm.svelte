<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ACCOUNT, DISCORD_RESULTS } from '#lib/content/account.ts';
	import { api, ApiError } from '#lib/account/account.svelte.ts';
	import AuthPage from './AuthPage.svelte';

	interface Props {
		/** Creating an account (asks for a gamer tag) or signing in to one. */
		mode: 'sign-up' | 'sign-in';
		/** Offer "Continue with Discord". */
		discord: boolean;
	}

	let { mode, discord }: Props = $props();

	let email = $state('');
	let password = $state('');
	let gamerTag = $state('');
	/** Back from Discord without signing in: why. */
	const fromDiscord = DISCORD_RESULTS[page.url.searchParams.get('discord') ?? ''];
	let error = $state(fromDiscord?.message ?? '');
	let busy = $state(false);

	const signingUp = $derived(mode === 'sign-up');

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const result = await api<{ ok?: true; mfa?: true }>(
				signingUp ? '/api/auth/sign-up' : '/api/auth/sign-in',
				'POST',
				signingUp ? { email, password, gamerTag } : { email, password }
			);
			if (result.mfa) {
				await goto(resolve('/auth/mfa'));
				return;
			}
			// A full load, so the server sees the new session.
			location.href = resolve('/(hub)');
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
			busy = false;
		}
	}
</script>

<AuthPage title={signingUp ? 'Create an account' : 'Sign in'} onsubmit={submit}>
	<label>
		<span>Email</span>
		<input type="email" autocomplete="email" required bind:value={email} />
	</label>

	<label>
		<span>Password</span>
		<input
			type="password"
			autocomplete={signingUp ? 'new-password' : 'current-password'}
			minlength={signingUp ? ACCOUNT.passwordMin : undefined}
			required
			bind:value={password}
		/>
	</label>

	{#if signingUp}
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
		<p class="muted">
			Your gamer tag is the name other players see. You can change it later on your Account screen.
		</p>
	{:else}
		<p class="muted"><a href={resolve('/auth/forgot')}>Forgot your password?</a></p>
	{/if}

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<button type="submit" class="primary" disabled={busy}>
		{signingUp ? 'Create account' : 'Sign in'}
	</button>

	{#if discord}
		<p class="or">or</p>
		<a class="discord" href={resolve('/auth/discord')} data-sveltekit-reload>
			Continue with Discord
		</a>
	{/if}

	<p class="muted">
		{#if signingUp}
			Already have an account? <a href={resolve('/auth/sign-in')}>Sign in</a>
		{:else}
			New here? <a href={resolve('/auth/sign-up')}>Create an account</a>
		{/if}
	</p>
</AuthPage>
