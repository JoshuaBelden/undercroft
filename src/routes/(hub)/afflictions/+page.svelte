<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/account/account.svelte.ts';
	import { connection, send } from '#lib/game/net/connection.svelte.ts';
	import Afflictions from '#lib/ui/Afflictions.svelte';

	const explorer = $derived(session.account?.explorer ?? null);
	/** Why this player cannot choose the Affliction right now (the server's rules, see Parties). */
	const joinBlocked = $derived.by(() => {
		const party = connection.party;
		if (!party) return 'Connecting...';
		if (party.leader !== connection.memberId) return 'Only the host chooses the Affliction';
		if (party.expedition) return 'An expedition is already under way';
		return undefined;
	});

	/** Join Expedition on a pane: choose that Affliction for the party, and on to the lobby. */
	function join(id: string): void {
		send({ type: 'affliction', id });
		void goto(resolve('/(hub)'));
	}
</script>

{#if explorer}
	<Afflictions progress={explorer.afflictions} onjoin={join} {joinBlocked} />
{:else}
	<p class="muted">Loading...</p>
{/if}

<style>
	.muted {
		margin: 32px;
		color: var(--muted);
	}
</style>
