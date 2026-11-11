<script lang="ts">
	import { resolve } from '$app/paths';
	import { signOut } from '#lib/account/account.svelte.ts';
	import HelpPanel from '#lib/ui/HelpPanel.svelte';
	import SettingsMenu from '#lib/ui/SettingsMenu.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let panel = $state<'settings' | 'help' | null>(null);
</script>

<main>
	<h1>Undercroft</h1>
	<nav>
		<a class="button" href={resolve('/play')}>Descend</a>
		<button type="button" onclick={() => (panel = 'settings')}>Settings</button>
		<button type="button" onclick={() => (panel = 'help')}>Help</button>
		<button type="button" onclick={() => void signOut()}>Sign out</button>
	</nav>
	{#if data.account}
		<p class="who">Signed in as {data.account.gamerTag}</p>
	{/if}
</main>

{#if panel === 'settings'}
	<SettingsMenu onclose={() => (panel = null)} />
{:else if panel === 'help'}
	<HelpPanel onclose={() => (panel = null)} />
{/if}

<style>
	main {
		min-height: 100vh;
		display: grid;
		place-content: center;
		gap: 32px;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-size: clamp(2.5rem, 8vw, 5rem);
		font-weight: normal;
		letter-spacing: 0.3em;
		text-transform: uppercase;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
	}

	nav > * {
		width: 200px;
	}

	.who {
		margin: 0;
		color: var(--muted);
	}

	.button {
		display: block;
		padding: 6px 12px;
		border: 1px solid var(--accent);
		color: var(--text);
		text-decoration: none;
	}
</style>
