<script lang="ts">
	import type { PartyMember } from '#lib/shared/party/types.ts';
	import Avatar from '#lib/ui/Avatar.svelte';

	/**
	 * One member of the party as a tall pane on the Expedition page, shaped like an Affliction's
	 * pane: their gamer tag, their avatar (none: a figure in the dark), and whether they are ready
	 * to descend.
	 */
	interface Props {
		member: PartyMember;
		/** They are the host: the one who chooses the Affliction. */
		host: boolean;
		/** This is the player looking at the page. */
		you: boolean;
	}

	let { member, host, you }: Props = $props();

	const status = $derived(
		!member.connected
			? 'Reconnecting'
			: member.inExpedition
				? 'Underground'
				: member.ready
					? 'Ready'
					: 'Not ready'
	);
</script>

<article class="pane" class:ready={member.ready} class:away={!member.connected}>
	{#if !member.avatar}
		<!-- No avatar: a figure in the dark. -->
		<svg class="figure" viewBox="0 0 200 320" aria-hidden="true">
			<circle cx="100" cy="74" r="38" />
			<path d="M22 320c0-98 30-168 78-168s78 70 78 168z" />
		</svg>
	{/if}

	<header>
		<h2>{member.name}</h2>
		<p class="roles">
			{#if host}<span>Host</span>{/if}
			{#if you}<span>You</span>{/if}
		</p>
	</header>

	{#if member.avatar}
		<div class="portrait">
			<Avatar src={member.avatar} size={208} lit={member.ready} />
		</div>
	{/if}

	<p class="status">{status}</p>
</article>

<style>
	/* The same shape as an Affliction's pane (AfflictionPane.svelte), a little narrower. */
	.pane {
		position: relative;
		flex: none;
		width: 320px;
		height: min(730px, calc(100vh - 200px));
		min-height: 420px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid transparent;
		/* The page's backdrop shows faintly through: the colours of #211c18 and --bg, see-through. */
		background: linear-gradient(rgb(33 28 24 / 0.85), rgb(10 9 8 / 0.85) 70%);
	}

	.pane.ready {
		border-color: var(--accent);
	}

	.pane.away {
		opacity: 0.55;
	}

	.figure {
		position: absolute;
		left: 50%;
		bottom: 0;
		width: 78%;
		translate: -50% 0;
		fill: rgb(0 0 0 / 0.5);
	}

	header {
		position: relative;
		flex: none;
		height: 190px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 0 20px;
		text-align: center;
		text-shadow: 0 2px 12px rgb(0 0 0 / 0.9);
	}

	.portrait {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		/* Sized by the pane, so the avatar can shrink to fit a short window. */
		container-type: size;
	}

	.portrait :global(.avatar) {
		width: min(208px, 90cqw, 90cqh);
		height: min(208px, 90cqw, 90cqh);
		box-shadow: 0 10px 40px rgb(0 0 0 / 0.7);
	}

	h2 {
		margin: 0;
		font-family: var(--font-lore);
		font-size: 1.7rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		overflow-wrap: anywhere;
	}

	.roles {
		min-height: 1.2em;
		margin: 0;
		display: flex;
		gap: 12px;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.75;
	}

	.status {
		position: relative;
		margin: auto 0 0;
		padding: 60px 20px 26px;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--muted);
		background: linear-gradient(transparent, rgb(10 9 8 / 0.9) 70px);
	}

	.pane.ready .status {
		color: var(--accent);
	}

	@media (max-width: 480px) {
		.pane {
			width: calc(100vw - 48px);
		}
	}
</style>
