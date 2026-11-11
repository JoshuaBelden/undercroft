<script lang="ts">
	import { resolve } from '$app/paths';
	import { PARTY } from '#lib/content/party.ts';
	import { saveSettings, settings } from '#lib/settings/settings.svelte.ts';
	import { canDescend, normalizeCode, type PartyState } from '#lib/shared/party/types.ts';

	interface Props {
		party: PartyState;
		/** This player's member id. */
		you: string;
		/** Why the last party request was refused; empty for none. */
		error: string;
		onready: (ready: boolean) => void;
		ondescend: () => void;
		onjoin: (code: string) => void;
		onleave: () => void;
		onrename: (name: string) => void;
		onsettings: () => void;
		onhelp: () => void;
	}

	let {
		party,
		you,
		error,
		onready,
		ondescend,
		onjoin,
		onleave,
		onrename,
		onsettings,
		onhelp
	}: Props = $props();

	const me = $derived(party.members.find((member) => member.id === you));
	const leading = $derived(party.leader === you);
	const solo = $derived(party.members.length === 1);
	const ready = $derived(canDescend(party));
	let code = $state('');
	let copied = $state(false);

	function rename(): void {
		saveSettings();
		onrename(settings.profile.name);
	}

	function join(event: SubmitEvent): void {
		event.preventDefault();
		const wanted = normalizeCode(code);
		if (!wanted) return;
		onjoin(wanted);
		code = '';
	}

	async function copyInvite(): Promise<void> {
		const link = `${location.origin}${resolve('/play')}?code=${party.code}`;
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard access can be refused; the code is on screen to read out instead.
		}
	}

	function memberStatus(member: PartyState['members'][number]): string {
		if (!member.connected) return 'Disconnected';
		if (member.inExpedition) return 'Underground';
		if (party.expedition) return 'On the surface';
		if (member.id === party.leader) return 'Leader';
		return member.ready ? 'Ready' : 'Not ready';
	}
</script>

<div class="screen">
	<div class="card">
		<h1>The surface</h1>

		<label class="row">
			<span>Your name</span>
			<input
				type="text"
				maxlength={PARTY.nameLength}
				placeholder={PARTY.defaultName}
				bind:value={settings.profile.name}
				onchange={rename}
			/>
		</label>

		<h2>Party</h2>
		<ul>
			{#each party.members as member (member.id)}
				<li class:ready={member.ready && !party.expedition} class:away={member.inExpedition}>
					<span class="name">{member.name}{member.id === you ? ' (you)' : ''}</span>
					<span class="state">{memberStatus(member)}</span>
				</li>
			{/each}
		</ul>

		<div class="invite">
			<span>Invite code</span>
			<code>{party.code}</code>
			<button type="button" onclick={copyInvite}>{copied ? 'Copied' : 'Copy link'}</button>
		</div>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<div class="actions">
			{#if party.expedition}
				<p class="note">An expedition is under way. Wait for the others to come back up.</p>
			{:else if leading}
				<button type="button" class="primary" disabled={!ready} onclick={ondescend}>Descend</button>
				{#if !ready}
					<p class="note">Waiting for everyone to be ready.</p>
				{/if}
			{:else}
				<button type="button" class="primary" onclick={() => onready(!me?.ready)}>
					{me?.ready ? 'Not ready' : 'Ready'}
				</button>
				<p class="note">The leader starts the descent once everyone is ready.</p>
			{/if}
		</div>

		<form class="join" onsubmit={join}>
			<label>
				<span>Join a party</span>
				<input
					type="text"
					placeholder="Code"
					maxlength={PARTY.codeLength + 2}
					autocomplete="off"
					bind:value={code}
				/>
			</label>
			<button type="submit" disabled={!normalizeCode(code)}>Join</button>
			{#if !solo}
				<button type="button" onclick={onleave}>Leave party</button>
			{/if}
		</form>

		<div class="links">
			<button type="button" onclick={onsettings}>Settings</button>
			<button type="button" onclick={onhelp}>Help</button>
			<a href={resolve('/')}>Main menu</a>
		</div>
	</div>
</div>

<style>
	.screen {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: radial-gradient(circle at 50% 40%, #1a1712 0%, #000 70%);
		z-index: 15;
		overflow-y: auto;
	}

	.card {
		width: min(420px, calc(100vw - 32px));
		margin: 16px 0;
		padding: 28px 32px;
		border: 1px solid rgb(232 223 207 / 0.15);
		background: rgb(0 0 0 / 0.5);
		color: #e8dfcf;
		font:
			13px ui-monospace,
			monospace;
	}

	h1 {
		margin: 0 0 24px;
		font:
			400 1.5rem Georgia,
			'Times New Roman',
			serif;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		text-align: center;
	}

	h2 {
		margin: 20px 0 8px;
		font-size: 11px;
		font-weight: normal;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.row,
	.invite,
	.join,
	.join label {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.row,
	.invite {
		justify-content: space-between;
	}

	.row span,
	.invite span,
	.join span {
		color: var(--muted);
	}

	input {
		font: inherit;
		color: inherit;
		background: rgb(255 255 255 / 0.04);
		border: 1px solid var(--border);
		padding: 6px 8px;
		min-width: 0;
	}

	.row input {
		width: 200px;
	}

	.join input {
		width: 90px;
		text-transform: uppercase;
	}

	.join {
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid rgb(232 223 207 / 0.1);
		flex-wrap: wrap;
	}

	ul {
		list-style: none;
		margin: 0 0 16px;
		padding: 0;
	}

	li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 0;
		border-bottom: 1px solid rgb(232 223 207 / 0.08);
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.state {
		flex: none;
		color: var(--muted);
	}

	li.ready .state {
		color: var(--accent);
	}

	li.away .name {
		color: var(--muted);
	}

	code {
		font-size: 18px;
		letter-spacing: 0.25em;
		color: var(--accent);
	}

	.actions {
		margin-top: 20px;
		text-align: center;
	}

	.primary {
		padding: 10px 28px;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		background: rgb(232 223 207 / 0.08);
		border-color: rgb(232 223 207 / 0.35);
	}

	button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.note {
		margin: 10px 0 0;
		color: var(--muted);
	}

	.error {
		margin: 12px 0 0;
		color: #ff9a70;
	}

	.links {
		margin-top: 20px;
		display: flex;
		gap: 12px;
		align-items: center;
		justify-content: center;
	}

	a {
		color: var(--muted);
	}
</style>
