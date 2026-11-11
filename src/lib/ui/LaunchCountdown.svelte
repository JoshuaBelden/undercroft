<script lang="ts">
	import { connection, send } from '#lib/game/net/connection.svelte.ts';

	/**
	 * Everyone in the party is ready: the seconds until the descent, over whatever page is open,
	 * with a way to call it off. Drawn by the root layout while `connection.launchAt` is set.
	 */
	let now = $state(Date.now());

	$effect(() => {
		if (connection.launchAt === null) return;
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 100);
		return () => clearInterval(timer);
	});

	const seconds = $derived(
		connection.launchAt === null ? null : Math.max(1, Math.ceil((connection.launchAt - now) / 1000))
	);
</script>

{#if seconds !== null}
	<div class="countdown" role="timer" aria-live="assertive">
		<p class="label">Descending in</p>
		{#key seconds}
			<p class="seconds">{seconds}</p>
		{/key}
		<button type="button" onclick={() => send({ type: 'ready', ready: false })}>Cancel</button>
	</div>
{/if}

<style>
	.countdown {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: rgb(6 5 5 / 0.72);
		backdrop-filter: blur(4px);
		text-shadow: 0 2px 16px rgb(0 0 0 / 0.9);
	}

	.label {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0.24em;
		text-transform: uppercase;
	}

	.seconds {
		margin: 0;
		font-family: var(--font-lore);
		font-size: 9rem;
		line-height: 1;
		color: var(--launch-bright);
		animation: tick 1s ease-out;
	}

	button {
		margin-top: 20px;
		padding: 10px 26px;
		border-color: var(--text);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	button:hover,
	button:focus-visible {
		border-color: var(--text);
		background: rgb(255 255 255 / 0.1);
	}

	@keyframes tick {
		from {
			scale: 1.25;
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.seconds {
			animation: none;
		}
	}
</style>
