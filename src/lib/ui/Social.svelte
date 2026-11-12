<script lang="ts">
	import { PARTY } from '#lib/content/party.ts';
	import { connection, me, send, social } from '#lib/game/net/connection.svelte.ts';
	import type { PartyMember } from '#lib/shared/party/types.ts';
	import { SOCIAL, type Friend, type Person } from '#lib/shared/social/types.ts';
	import Dialog from '#lib/ui/Dialog.svelte';

	/**
	 * The Social page: everything between players. On the left, one above the other: finding
	 * players by gamer tag (with the requests going either way), and your friends (all of them,
	 * online or not, to invite or remove), which takes the rest of the height. Beside them, your
	 * party (who is in it, and who has been asked into it; the host can remove someone; a player
	 * on their own has no party and the panel is not there). Everything in
	 * it comes from the game server as it changes (`connection.party`, `connection.social`).
	 * See docs/dev/social.md.
	 */

	const lists = $derived(connection.social);
	const party = $derived(connection.party);
	const you = $derived(me());
	const host = $derived(party !== null && party.leader === connection.memberId);
	/** Nobody can be invited once the party is full or underground. */
	const canInvite = $derived(
		party !== null && !party.expedition && party.members.length < PARTY.maxSize
	);
	/** Friends who are here come first, then the rest; each group by name (as the server sent). */
	const friends = $derived(
		lists
			? [
					...lists.friends.filter((friend) => friend.status !== 'offline'),
					...lists.friends.filter((friend) => friend.status === 'offline')
				]
			: []
	);
	const online = $derived(friends.filter((friend) => friend.status !== 'offline').length);

	/** Friends we have invited who have not answered yet: shown in the party, waiting. */
	const pending = $derived(
		lists ? lists.friends.filter((friend) => lists.invited.includes(friend.account)) : []
	);
	/**
	 * There is a party to show: someone is in it with us, someone has been asked into it, or
	 * someone has asked us into theirs. A player on their own sees no Party panel.
	 */
	const grouped = $derived(
		(party !== null && party.members.length > 1) ||
			pending.length > 0 ||
			(lists !== null && lists.invites.length > 0)
	);

	let query = $state('');
	/** Who is about to be kicked (a member id): asked twice. */
	let removing = $state<string | null>(null);
	/** The friend we are asking about removing, in the confirmation dialog. */
	let unfriending = $state<Friend | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	const searching = $derived(query.trim().length >= SOCIAL.searchMin);
	/** Results for what is typed now (an answer to an earlier query is not shown). */
	const results = $derived(
		searching && connection.search?.query === query.trim() ? connection.search.results : null
	);

	const STATUS: Record<Friend['status'], string> = {
		offline: 'Offline',
		online: 'Online',
		inParty: 'In a party',
		underground: 'Underground'
	};

	function memberStatus(member: PartyMember): string {
		if (!member.connected) return 'Reconnecting';
		if (member.inExpedition) return 'Underground';
		return member.ready ? 'Ready' : 'Not ready';
	}

	/** Ask the server once typing pauses. */
	function typed(): void {
		if (searchTimer) clearTimeout(searchTimer);
		const wanted = query.trim();
		if (wanted.length < SOCIAL.searchMin) return;
		searchTimer = setTimeout(() => social({ kind: 'search', query: wanted }), 250);
	}

	/** What someone found by searching already is to us. */
	function relation(person: Person): 'friend' | 'incoming' | 'outgoing' | 'none' {
		const has = (list: Person[] | undefined): boolean =>
			list?.some((entry) => entry.account === person.account) === true;
		if (has(lists?.friends)) return 'friend';
		if (has(lists?.incoming)) return 'incoming';
		if (has(lists?.outgoing)) return 'outgoing';
		return 'none';
	}

	/** The first click asks; the second, on the same one, does it (kicking a party member). */
	function twice(key: string, act: () => void): void {
		if (removing !== key) {
			removing = key;
			return;
		}
		removing = null;
		act();
	}
</script>

<div class="social">
	<div class="side">
		<section class="panel find" aria-labelledby="find-title">
			<header>
				<h2 id="find-title">Find players</h2>
			</header>
			<div class="scroll">
				<input
					type="search"
					aria-label="Search by gamer tag"
					placeholder="Search by gamer tag"
					autocomplete="off"
					spellcheck="false"
					maxlength="24"
					bind:value={query}
					oninput={typed}
				/>
				{#if searching}
					{#if results === null}
						<p class="muted">Searching...</p>
					{:else if results.length === 0}
						<p class="muted">No player's gamer tag starts with that.</p>
					{:else}
						<ul>
							{#each results as person (person.account)}
								{@const what = relation(person)}
								<li>
									<span class="who"><span class="name">{person.name}</span></span>
									{#if what === 'friend'}
										<span class="sub">Friends</span>
									{:else if what === 'outgoing'}
										<span class="sub">Requested</span>
									{:else if what === 'incoming'}
										<button
											type="button"
											class="primary"
											onclick={() => social({ kind: 'accept', account: person.account })}
										>
											Accept
										</button>
									{:else}
										<button
											type="button"
											class="primary"
											onclick={() => social({ kind: 'request', account: person.account })}
										>
											Add
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				{/if}

				<h3>Friend requests</h3>
				{#if !lists || lists.incoming.length === 0}
					<p class="muted">None waiting for you.</p>
				{:else}
					<ul>
						{#each lists.incoming as person (person.account)}
							<li>
								<span class="who"><span class="name">{person.name}</span></span>
								<button
									type="button"
									class="primary"
									onclick={() => social({ kind: 'accept', account: person.account })}
								>
									Accept
								</button>
								<button
									type="button"
									onclick={() => social({ kind: 'decline', account: person.account })}
								>
									Decline
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				{#if lists && lists.outgoing.length > 0}
					<h3>Requests you sent</h3>
					<ul>
						{#each lists.outgoing as person (person.account)}
							<li>
								<span class="who">
									<span class="name">{person.name}</span>
									<span class="sub">Waiting for an answer</span>
								</span>
								<button
									type="button"
									onclick={() => social({ kind: 'decline', account: person.account })}
								>
									Cancel
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<section class="panel friends" aria-labelledby="friends-title">
			<header>
				<h2 id="friends-title">Friends</h2>
				{#if lists}
					<span class="count">{online} online of {friends.length}</span>
				{/if}
			</header>
			<div class="scroll">
				{#if connection.error}
					<p class="error" role="alert">{connection.error}</p>
				{/if}
				{#if !lists}
					<p class="muted">Loading...</p>
				{:else if friends.length === 0}
					<p class="muted">Nobody yet. Find a player by their gamer tag to add them.</p>
				{:else}
					<ul>
						{#each friends as friend (friend.account)}
							<!-- Only a friend who is online and in no party can be invited. -->
							{@const free = friend.status === 'online'}
							<li class:off={friend.status === 'offline'}>
								<span class="who">
									<span class="name">{friend.name}</span>
									<span class="sub" class:on={friend.status !== 'offline'}>
										{friend.withYou ? 'In your party' : STATUS[friend.status]}
									</span>
								</span>
								{#if friend.withYou}
									<!-- Nothing to do: they are here. -->
								{:else if lists.invited.includes(friend.account)}
									<span class="sub">Invited</span>
								{:else if free}
									<button
										type="button"
										class="primary"
										disabled={!canInvite}
										title={canInvite ? undefined : 'Your party is full or underground'}
										onclick={() => social({ kind: 'invite', account: friend.account })}
									>
										Invite
									</button>
								{/if}
								<button type="button" onclick={() => (unfriending = friend)}>Remove</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>
	</div>

	{#if grouped}
		<section class="panel party" aria-labelledby="party-title">
			<header>
				<h2 id="party-title">Party</h2>
				{#if party}
					<span class="count">{party.members.length} / {PARTY.maxSize}</span>
				{/if}
			</header>
			<div class="scroll">
				{#if lists && lists.invites.length > 0}
					<h3>Invites</h3>
					<ul>
						{#each lists.invites as person (person.account)}
							<li>
								<span class="who">
									<span class="name">{person.name}</span>
									<span class="sub">invites you to their party</span>
								</span>
								<button
									type="button"
									class="primary"
									onclick={() => social({ kind: 'acceptInvite', account: person.account })}
								>
									Join
								</button>
								<button
									type="button"
									onclick={() => social({ kind: 'declineInvite', account: person.account })}
								>
									Decline
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				{#if party && you && (party.members.length > 1 || pending.length > 0)}
					<ul>
						{#each party.members as member (member.id)}
							<li>
								<span class="who">
									<span class="name">
										{member.name}
										{#if member.id === party.leader && party.members.length > 1}
											<span class="role">Host</span>
										{/if}
										{#if member.id === you.id}<span class="role">You</span>{/if}
									</span>
									<span class="sub" class:on={member.ready}>{memberStatus(member)}</span>
								</span>
								{#if host && member.id !== you.id && !party.expedition}
									<button
										type="button"
										class:danger={removing === member.id}
										onclick={() =>
											twice(member.id, () => send({ type: 'kick', member: member.id }))}
										onblur={() => (removing = null)}
									>
										{removing === member.id ? 'Sure?' : 'Kick'}
									</button>
								{/if}
							</li>
						{/each}
						<!-- Asked to join, and yet to answer. -->
						{#each pending as friend (friend.account)}
							<li class="off">
								<span class="who">
									<span class="name">{friend.name}</span>
									<span class="sub">Invited: waiting for them to accept</span>
								</span>
							</li>
						{/each}
					</ul>
					{#if party.members.length > 1 && !you.inExpedition}
						<button type="button" class="leave" onclick={() => send({ type: 'leaveParty' })}>
							Leave party
						</button>
					{/if}
				{/if}
			</div>
		</section>
	{/if}
</div>

{#if unfriending}
	{@const friend = unfriending}
	<Dialog title="Remove friend" onclose={() => (unfriending = null)}>
		<p>{friend.name} is taken off your friends list, and you come off theirs.</p>
		<p>To be friends again, one of you has to send a new request.</p>
		{#snippet footer()}
			<button type="button" onclick={() => (unfriending = null)}>Cancel</button>
			<button
				type="button"
				class="primary"
				onclick={() => {
					unfriending = null;
					social({ kind: 'remove', account: friend.account });
				}}
			>
				Remove
			</button>
		{/snippet}
	</Dialog>
{/if}

<style>
	/*
	 * A full-width page, under the bar and clear of the corner buttons: the party beside a column
	 * on the left that holds Find players over the friends list.
	 */
	.social {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(320px, 440px) minmax(0, 1fr);
		align-items: start;
		gap: 20px;
		padding: 24px 0 84px;
	}

	/* Beside the left-hand column, and no wider than a list of players needs. */
	.party {
		grid-column: 2;
		width: min(100%, 520px);
	}

	/*
	 * The left-hand column keeps its place whether or not there is a party. It is as tall as the
	 * window allows: Find players takes what it needs (up to half), the friends list the rest.
	 */
	.side {
		grid-column: 1;
		height: calc(100vh - 170px);
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.find {
		flex: none;
		max-height: 50%;
	}

	.friends {
		flex: 1;
		min-height: 0;
	}

	/* The same containers as the Loadout and Store pages. */
	.panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		max-height: calc(100vh - 170px);
		padding: 18px 20px 20px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.55);
		backdrop-filter: blur(6px);
	}

	header {
		flex: none;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	h2 {
		margin: 0;
		font-size: 1.3rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.count {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--muted);
	}

	.scroll {
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	h3 {
		margin: 20px 0 8px;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.scroll > h3:first-child {
		margin-top: 0;
	}

	input {
		width: 100%;
		padding: 8px 14px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: rgb(0 0 0 / 0.4);
		color: var(--text);
		font-size: 1rem;
	}

	input:focus-visible {
		outline: none;
		border-color: var(--accent);
	}

	ul {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	li {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 4px 0;
		border-bottom: 1px solid rgb(58 51 44 / 0.5);
	}

	li:last-child {
		border-bottom: 0;
	}

	li.off .name {
		color: var(--muted);
	}

	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-ui);
		font-weight: 600;
	}

	.role {
		margin-left: 6px;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.sub {
		font-size: 0.85rem;
		color: var(--muted);
	}

	.sub.on {
		color: var(--accent);
	}

	li button {
		flex: none;
		padding: 5px 14px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	li button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}

	li button.primary:hover:not(:disabled),
	li button.primary:focus-visible {
		border-color: var(--text);
	}

	li button.danger {
		border-color: #ff9a70;
		color: #ff9a70;
	}

	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.leave {
		margin-top: 14px;
		padding: 6px 16px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.muted,
	.error {
		margin: 8px 0 0;
		color: var(--muted);
	}

	.error {
		margin-bottom: 12px;
		color: #ff9a70;
	}

	@media (max-width: 1000px) {
		.social {
			grid-template-columns: minmax(0, 1fr);
			padding: 16px 16px 84px;
		}

		.party,
		.side {
			grid-column: 1;
		}

		.party {
			width: auto;
		}

		/* One column: everything is as tall as what is in it, and the page scrolls. */
		.side {
			height: auto;
		}

		.panel,
		.find {
			max-height: none;
		}
	}
</style>
