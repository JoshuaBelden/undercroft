<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/account/account.svelte.ts';
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import { imageUrl } from '#lib/content/images.ts';
	import { connection, me, send } from '#lib/game/net/connection.svelte.ts';
	import { prefetch } from '#lib/game/prefetch.svelte.ts';
	import AfflictionPicker from '#lib/ui/AfflictionPicker.svelte';
	import { dragScroll } from '#lib/ui/dragScroll.ts';
	import ExplorerPane from '#lib/ui/ExplorerPane.svelte';
	import { launch } from '#lib/ui/launch.svelte.ts';

	/*
	 * The Expedition page: the party, one pane each, and the launch panel in the lower right. The
	 * host chooses the Affliction; anyone presses Launch, confirms their loadout on the Loadout
	 * page and is then ready; once everyone is, the descent counts down (the countdown itself is
	 * drawn by the root layout, over whatever page is open). See docs/dev/expedition.md.
	 */

	const explorer = $derived(session.account?.explorer ?? null);
	const party = $derived(connection.party);
	const you = $derived(me());
	const host = $derived(party !== null && party.leader === connection.memberId);
	const affliction = $derived(party?.affliction ? (AFFLICTIONS[party.affliction] ?? null) : null);
	// The host's status, not yours: a friend who has done it already doesn't give it away.
	const resolved = $derived(party?.progress?.resolved ?? false);
	/** Members who have not readied up yet. */
	const waitingFor = $derived(party?.members.filter((member) => !member.ready).length ?? 0);

	/** How far the background download of the shared assets has got (hidden once done). */
	const preparing = $derived.by(() => {
		const progress = prefetch.progress;
		if (prefetch.done || !progress || progress.total === 0) return null;
		return Math.min(99, Math.floor((progress.loaded / progress.total) * 100));
	});

	/** The host is choosing the Affliction. */
	let picking = $state(false);

	function choose(id: string): void {
		send({ type: 'affliction', id });
		picking = false;
	}

	/** Launch: on to the Loadout page, to confirm what goes down. */
	function confirmLoadout(): void {
		launch.confirming = true;
		void goto(resolve('/(hub)/loadout'));
	}
</script>

<div class="expedition">
	{#if party && you}
		<div class="track" use:dragScroll>
			{#each party.members as member (member.id)}
				<ExplorerPane {member} host={member.id === party.leader} you={member.id === you.id} />
			{/each}
		</div>

		<aside class="launch" aria-label="Launch">
			<h2>Affliction</h2>
			{#if affliction}
				<div class="chosen" style:--art="url('{imageUrl(affliction.image)}')">
					<span class="name">{affliction.name}</span>
					<span class="state" class:resolved>{resolved ? 'Resolved' : 'Unresolved'}</span>
				</div>
				{#if host && !party.expedition}
					<button type="button" class="pill" onclick={() => (picking = true)}>
						Change Affliction
					</button>
				{/if}
			{:else if host}
				<button type="button" class="pill" onclick={() => (picking = true)}>
					Select Affliction
				</button>
			{:else}
				<p class="note">The host has not chosen one yet.</p>
			{/if}

			{#if party.expedition}
				<p class="note">Your party is underground. You can launch again once they are back.</p>
			{:else if you.ready}
				<p class="ready" role="status">
					{#if waitingFor === 0}
						Everyone is ready.
					{:else}
						You're ready. Waiting for {waitingFor} more.
					{/if}
				</p>
				<button type="button" class="pill" onclick={() => send({ type: 'ready', ready: false })}>
					Cancel
				</button>
			{:else}
				<button
					type="button"
					class="pill go"
					disabled={!affliction}
					title={affliction ? undefined : 'An Affliction has to be chosen first'}
					onclick={confirmLoadout}
				>
					Launch Expedition
				</button>
			{/if}

			{#if connection.error}
				<p class="note error" role="alert">{connection.error}</p>
			{/if}

			{#if preparing !== null}
				<p class="note preparing" role="status">Preparing the descent... {preparing}%</p>
			{/if}

			{#if party.members.length > 1 && !you.inExpedition}
				<button type="button" class="leave" onclick={() => send({ type: 'leaveParty' })}>
					Leave party
				</button>
			{/if}
		</aside>
	{:else}
		<p class="connecting" role="status">
			{connection.status === 'rejected'
				? connection.detail || 'The game server turned the connection away.'
				: 'Connecting...'}
		</p>
	{/if}
</div>

{#if picking && explorer && party}
	<AfflictionPicker
		progress={explorer.afflictions}
		selected={party.affliction}
		onselect={choose}
		onclose={() => (picking = false)}
	/>
{/if}

<style>
	/* A full-width page: the strip of panes in the middle of everything under the bar. */
	.expedition {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
		padding: 24px 0 84px;
	}

	/* The party, centred; it scrolls sideways (dragScroll, touch, the scrollbar) if it has to. */
	.track {
		flex: none;
		display: flex;
		justify-content: safe center;
		gap: 20px;
		padding: 0 0 14px;
		overflow-x: auto;
		cursor: grab;
		user-select: none;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.track:global(.dragging) {
		cursor: grabbing;
	}

	/* The launch panel: lower right, above the corner buttons. */
	.launch {
		position: fixed;
		right: 20px;
		bottom: 84px;
		width: 320px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 18px 20px 20px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.72);
		backdrop-filter: blur(6px);
	}

	h2 {
		margin: 0;
		font-size: 0.8rem;
		font-family: var(--font-ui);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	/* The chosen Affliction: its name over a strip of its picture. */
	.chosen {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 22px 16px;
		border-radius: 12px;
		text-align: center;
		text-shadow: 0 2px 12px rgb(0 0 0 / 0.9);
		background:
			linear-gradient(rgb(10 9 8 / 0.35), rgb(10 9 8 / 0.7)),
			var(--art) center 30% / cover no-repeat,
			#211c18;
	}

	.name {
		font-family: var(--font-lore);
		font-size: 1.5rem;
		font-weight: 600;
		letter-spacing: 0.08em;
	}

	.state {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.75;
	}

	.state.resolved {
		color: var(--accent);
		opacity: 1;
	}

	.pill {
		padding: 10px 20px;
		border-color: var(--text);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.pill:hover:not(:disabled),
	.pill:focus-visible {
		border-color: var(--text);
		background: rgb(255 255 255 / 0.1);
	}

	/* Launch: the one dark yellow button. */
	.pill.go {
		padding: 14px 20px;
		border-color: var(--launch);
		background: var(--launch);
		color: #14110f;
		font-size: 1rem;
		font-weight: 700;
	}

	.pill.go:hover:not(:disabled),
	.pill.go:focus-visible {
		border-color: var(--launch-bright);
		background: var(--launch-bright);
	}

	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.note,
	.ready {
		margin: 0;
		color: var(--muted);
	}

	.ready {
		font-weight: 600;
		color: var(--accent);
	}

	.note.preparing {
		font-size: 0.85em;
	}

	.note.error {
		color: #ff9a70;
	}

	.leave {
		align-self: center;
		padding: 2px 8px;
		border-color: transparent;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.leave:hover,
	.leave:focus-visible {
		border-color: transparent;
		color: var(--text);
		text-decoration: underline;
	}

	.connecting {
		margin: 0;
		text-align: center;
		color: var(--muted);
	}

	@media (max-width: 720px) {
		.expedition {
			justify-content: flex-start;
			padding: 16px 16px 24px;
		}

		/* No room beside the panes: the panel goes under them, in the page. */
		.launch {
			position: static;
			width: auto;
			margin: 16px 0 64px;
		}
	}
</style>
