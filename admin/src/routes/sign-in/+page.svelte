<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · Undercroft Admin</title></svelte:head>

<main class="sign-in">
	<form method="POST" class="panel" use:enhance>
		<h1>Undercroft Admin</h1>
		<label>
			Email
			<input name="email" type="email" autocomplete="username" required value={form?.email ?? ''} />
		</label>
		<label>
			Password
			<input name="password" type="password" autocomplete="current-password" required />
		</label>
		<label>
			Two-step code
			<input
				name="code"
				autocomplete="one-time-code"
				inputmode="numeric"
				required
				placeholder="From your authenticator app, or a recovery code"
			/>
		</label>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<button type="submit" class="primary">Sign in</button>
	</form>
</main>

<style>
	.sign-in {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 16px;
	}

	form {
		width: min(380px, 100%);
		display: grid;
		gap: 14px;
	}

	h1 {
		margin: 0 0 4px;
		font-size: 28px;
	}

	label {
		display: grid;
		gap: 6px;
	}
</style>
