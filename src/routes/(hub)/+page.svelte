<script lang="ts">
	import { resolve } from '$app/paths';
	import { session } from '#lib/account/account.svelte.ts';
	import { AFFLICTIONS, DEFAULT_AFFLICTION } from '#lib/content/afflictions.ts';
	import { PARTY } from '#lib/content/party.ts';
	import { allStacks } from '#lib/shared/items/inventory.ts';
	import { normalizeCode } from '#lib/shared/party/types.ts';
	import { stackLabel } from '#lib/ui/items.ts';

	let code = $state('');

	const explorer = $derived(session.account?.explorer ?? null);
	const carrying = $derived(explorer ? allStacks(explorer.loadout).map(stackLabel) : []);
	/** The Affliction an expedition goes against (there is only one to choose so far). */
	const affliction = AFFLICTIONS[DEFAULT_AFFLICTION.id];
	const resolved = $derived(
		explorer?.afflictions.some((entry) => entry.id === affliction.id && entry.resolved) ?? false
	);
</script>

<section class="card">
	<h2>Against</h2>
	<p class="lead">
		{affliction.name}
		<span class="status" class:resolved>{resolved ? 'Resolved' : 'Unresolved'}</span>
	</p>
	<p class="muted">
		What you know of its rite is under <a href={resolve('/(hub)/afflictions')}>Afflictions</a>.
	</p>
</section>

<section class="card">
	<h2>What you're taking</h2>
	{#if !explorer}
		<p class="muted">Loading...</p>
	{:else if carrying.length === 0}
		<p class="lead">Nothing but your headlamp.</p>
	{:else}
		<p class="lead">{carrying.join(', ')}</p>
	{/if}
	<p class="muted">
		Change it under <a href={resolve('/(hub)/loadout')}>Loadout</a> before you set out.
	</p>
</section>

{#if explorer?.underground}
	<section class="card">
		<h2>Under way</h2>
		<p class="lead">You're already on an expedition.</p>
		<a class="button primary" href={resolve('/play')}>Return to it</a>
	</section>
{:else}
	<div class="ways">
		<section class="card">
			<h2>Start one</h2>
			<p class="muted">
				You'll gather on the surface with an invite code to share. Nobody goes down until the party
				is ready and you choose to descend. Go alone, or with up to {PARTY.maxSize - 1}
				others.
			</p>
			<a class="button primary" href={resolve('/play')}>Start an expedition</a>
		</section>

		<section class="card">
			<h2>Join one</h2>
			<p class="muted">Enter the invite code a friend gave you.</p>
			<!-- A plain GET form: it opens the party screen with ?code=..., like an invite link. -->
			<form method="get" action={resolve('/play')}>
				<input
					type="text"
					name="code"
					placeholder="Code"
					aria-label="Invite code"
					maxlength={PARTY.codeLength + 2}
					autocomplete="off"
					bind:value={code}
				/>
				<button type="submit" disabled={!normalizeCode(code)}>Join</button>
			</form>
		</section>
	</div>
{/if}

<style>
	.card {
		margin-bottom: 16px;
		padding: 20px;
		background: rgb(10 9 8 / 0.82);
		border: 1px solid var(--border);
	}

	.ways {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.ways .card {
		margin-bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (max-width: 640px) {
		.ways {
			grid-template-columns: 1fr;
		}
	}

	h2 {
		margin: 0 0 8px;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.ways h2 {
		margin: 0;
	}

	.lead {
		margin: 0 0 6px;
		font-size: 1.1rem;
	}

	.status {
		margin-left: 12px;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.status.resolved {
		color: var(--accent);
	}

	.muted {
		margin: 0;
		color: var(--muted);
	}

	.muted a {
		color: var(--text);
	}

	.button {
		align-self: flex-start;
		margin-top: auto;
		padding: 8px 16px;
		border: 1px solid var(--border);
		color: var(--text);
		text-decoration: none;
	}

	.button.primary {
		border-color: var(--accent);
	}

	form {
		display: flex;
		gap: 8px;
		margin-top: auto;
	}

	input {
		width: 110px;
		padding: 6px 8px;
		font: inherit;
		color: inherit;
		text-transform: uppercase;
		background: rgb(255 255 255 / 0.04);
		border: 1px solid var(--border);
	}
</style>
