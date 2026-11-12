<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { AFFLICTIONS } from '#lib/content/afflictions.ts';
	import { loadAccount, session } from '#lib/account/account.svelte.ts';
	import { connection, send, subscribe } from '#lib/game/net/connection.svelte.ts';
	import { allStacks } from '#lib/shared/items/inventory.ts';
	import Afflictions from '#lib/ui/Afflictions.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
	/** Why this player cannot choose the Affliction right now (the server's rules, see Parties). */
	const joinBlocked = $derived.by(() => {
		const party = connection.party;
		if (!party) return 'Connecting...';
		if (party.leader !== connection.memberId) return 'Only the host chooses the Affliction';
		if (party.expedition) return 'An expedition is already under way';
		return undefined;
	});
	/** Why progress can't be reset right now (the server refuses it while underground). */
	const resetBlocked = $derived.by(() => {
		const party = connection.party;
		if (!party) return 'Connecting...';
		if (party.expedition) return 'An expedition is under way';
		return undefined;
	});
	/** How many of each item the explorer has, in the stash and the loadout. */
	const owned = $derived.by(() => {
		const counts: Record<string, number> = {};
		if (!explorer) return counts;
		for (const stack of [...explorer.stash, ...allStacks(explorer.loadout)]) {
			if (stack) counts[stack.item] = (counts[stack.item] ?? 0) + stack.count;
		}
		return counts;
	});

	/** The Affliction whose reset is being confirmed. */
	let resetting = $state<string | null>(null);

	/** Join Expedition on a pane: choose that Affliction for the party, and on to the lobby. */
	function join(id: string): void {
		send({ type: 'affliction', id });
		void goto(resolve('/(hub)'));
	}

	function reset(): void {
		if (resetting) send({ type: 'resetAffliction', id: resetting });
		resetting = null;
	}

	// The game server has forgotten it: show the account as it is now.
	$effect(() =>
		subscribe({
			onMessage: (message) => {
				if (message.type === 'afflictionReset') void loadAccount();
			}
		})
	);
</script>

{#if explorer}
	<Afflictions
		progress={explorer.afflictions}
		{owned}
		onjoin={join}
		{joinBlocked}
		onreset={(id) => (resetting = id)}
		{resetBlocked}
	/>
{:else}
	<p class="muted">Loading...</p>
{/if}

{#if resetting}
	<Dialog
		title="Reset {AFFLICTIONS[resetting]?.name ?? 'the Affliction'}"
		onclose={() => (resetting = null)}
	>
		<p>You forget every hint you have found, and it is unresolved again.</p>
		<p>What you own is not changed.</p>
		{#snippet footer()}
			<button type="button" onclick={() => (resetting = null)}>Cancel</button>
			<button type="button" class="primary" onclick={reset}>Reset</button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
