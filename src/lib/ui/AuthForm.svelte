<script lang="ts">
	import { resolve } from '$app/paths';
	import { ACCOUNT } from '#lib/content/account.ts';
	import { BACKDROP_IMAGE } from '#lib/content/images.ts';
	import { api, ApiError } from '#lib/account/account.svelte.ts';
	import { parallax } from './parallax.ts';

	interface Props {
		/** Creating an account (asks for a gamer tag) or signing in to one. */
		mode: 'sign-up' | 'sign-in';
	}

	let { mode }: Props = $props();

	let email = $state('');
	let password = $state('');
	let gamerTag = $state('');
	let error = $state('');
	let busy = $state(false);

	const signingUp = $derived(mode === 'sign-up');

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			await api(
				signingUp ? '/api/auth/sign-up' : '/api/auth/sign-in',
				'POST',
				signingUp ? { email, password, gamerTag } : { email, password }
			);
			// A full load, so the server sees the new session.
			location.href = resolve('/(hub)');
		} catch (caught) {
			error = caught instanceof ApiError ? caught.message : 'Could not reach the server';
			busy = false;
		}
	}
</script>

<main class="backdrop-art" style:--backdrop-image={BACKDROP_IMAGE} use:parallax>
	<form onsubmit={submit}>
		<h2>{signingUp ? 'Create an account' : 'Sign in'}</h2>

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
				Your gamer tag is the name other players see. You can change it later in the settings.
			</p>
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<button type="submit" class="primary" disabled={busy}>
			{signingUp ? 'Create account' : 'Sign in'}
		</button>

		<p class="muted">
			{#if signingUp}
				Already have an account? <a href={resolve('/auth/sign-in')}>Sign in</a>
			{:else}
				New here? <a href={resolve('/auth/sign-up')}>Create an account</a>
			{/if}
		</p>
	</form>
</main>

<style>
	main {
		min-height: 100vh;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 32px;
		padding: 24px;
	}

	form {
		width: min(360px, calc(100vw - 48px));
		display: grid;
		gap: 14px;
		padding: 24px;
		background: var(--panel);
		border: 1px solid var(--border);
	}

	h2 {
		margin: 0 0 4px;
		font-size: 1rem;
		font-weight: normal;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	label {
		display: grid;
		gap: 6px;
	}

	label span {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}

	input {
		width: 100%;
	}

	.primary {
		border-color: var(--accent);
	}

	.muted {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
	}

	.error {
		margin: 0;
		color: #ff9a70;
	}

	a {
		color: var(--text);
	}
</style>
