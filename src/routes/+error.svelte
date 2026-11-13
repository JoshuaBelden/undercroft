<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { openBugReport } from '#lib/game/crash.svelte.ts';

	/**
	 * A page that couldn't be shown. A bug on our server (it has an `errorId`, from
	 * hooks.server.ts) can be reported from here, grouped with the error it recorded.
	 */
	const errorId = $derived(page.error?.errorId);
</script>

<main class="backdrop-art">
	<div class="box">
		<h1>{page.status === 404 ? 'Nothing down here' : 'Something went wrong'}</h1>
		<p>{page.status === 404 ? "That page doesn't exist." : page.error?.message}</p>
		<div class="actions">
			<a href={resolve('/(hub)')}>Back to the dashboard</a>
			{#if errorId && page.data.account}
				<button
					type="button"
					onclick={() =>
						openBugReport({
							source: 'web',
							message: page.error?.message ?? 'Server error',
							errorId
						})}
				>
					Report it
				</button>
			{/if}
		</div>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 16px;
	}

	.box {
		max-width: 480px;
		padding: 28px 32px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(20 17 15 / 0.85);
		text-align: center;
	}

	h1 {
		margin: 0 0 10px;
	}

	.actions {
		display: flex;
		gap: 12px;
		justify-content: center;
		align-items: center;
		margin-top: 18px;
	}

	a,
	button {
		padding: 7px 20px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}

	a:hover,
	button:hover {
		background: rgb(255 255 255 / 0.1);
	}
</style>
