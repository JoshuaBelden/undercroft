<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { loadAccount, session } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import HelpPanel from '#lib/ui/HelpPanel.svelte';
	import { parallax } from '#lib/ui/parallax.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let help = $state(false);

	const explorer = $derived(session.account?.explorer ?? null);
	const gamerTag = $derived(session.account?.gamerTag ?? data.account?.gamerTag ?? '');

	/** The dashboard's screens, in the order of the tabs. The store is reached from the money. */
	const TABS = [
		{ path: '/(hub)', label: 'Expedition' },
		{ path: '/(hub)/loadout', label: 'Loadout' },
		{ path: '/(hub)/afflictions', label: 'Afflictions' }
	] as const;

	onMount(() => {
		void loadAccount();
		// Only the two interface actions: every other key and click is left to the page.
		const input = new InputMap(window, ['toggleSettings', 'toggleHelp']);
		const unsubscribe = input.onPressed((action) => {
			// With Help open the key closes it; otherwise it opens the settings page.
			if (action === 'toggleSettings') {
				if (help) help = false;
				else void goto(resolve('/settings'));
			}
			if (action === 'toggleHelp') help = !help;
		});
		return () => {
			unsubscribe();
			input.dispose();
		};
	});
</script>

<div class="hub backdrop-art" use:parallax>
	<header>
		<nav aria-label="Dashboard">
			{#each TABS as tab (tab.path)}
				<a
					href={resolve(tab.path)}
					class:current={page.route.id === tab.path}
					aria-current={page.route.id === tab.path ? 'page' : undefined}
				>
					{tab.label}
				</a>
			{/each}
		</nav>
		<div class="who">
			{#if explorer}
				<a
					class="coins"
					class:current={page.route.id === '/(hub)/store'}
					href={resolve('/(hub)/store')}
					aria-label="Store: you have {money(explorer.money)}"
					aria-current={page.route.id === '/(hub)/store' ? 'page' : undefined}
					title="Store"
				>
					<span class="sign" aria-hidden="true">＄</span>
					<span aria-hidden="true">{explorer.money}</span>
				</a>
			{/if}
			<span class="tag">{gamerTag}</span>
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<div class="corner">
		<a class="icon" href={resolve('/settings')} aria-label="Settings" title="Settings">
			<svg viewBox="0 0.2 24 24" width="22" height="22" aria-hidden="true">
				<path
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linejoin="round"
					d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"
				/>
				<circle cx="12" cy="12.2" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />
			</svg>
		</a>
		<button
			type="button"
			class="icon"
			aria-label="Help"
			title="Help"
			onclick={() => (help = !help)}
		>
			<span aria-hidden="true">?</span>
		</button>
	</div>
</div>

{#if help}
	<HelpPanel onclose={() => (help = false)} />
{/if}

<style>
	.hub {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		gap: 28px;
		padding: 0 24px;
		background: rgb(10 9 8 / 0.78);
	}

	nav {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 10px;
		padding: 12px 0;
	}

	/* Tabs are plain white text; the one you are on gets a white pill outline. */
	nav a {
		padding: 6px 16px;
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-decoration: none;
		color: var(--text);
	}

	nav a:hover,
	nav a:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	nav a.current {
		border-color: var(--text);
	}

	.who {
		display: flex;
		align-items: center;
		gap: 18px;
		white-space: nowrap;
	}

	/* The money is the way into the store: a link, outlined like a tab while you are there. */
	.coins {
		display: flex;
		align-items: center;
		padding: 2px 14px 2px 8px;
		border: 1px solid transparent;
		border-radius: 999px;
		text-decoration: none;
		/* The full-width sign carries its own space on each side: no gap, and pull the value in. */
		gap: 0;
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: bold;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}

	.coins:hover,
	.coins:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	.coins.current {
		border-color: var(--accent);
	}

	.sign {
		margin-right: -0.12em;
	}

	.tag {
		font-family: var(--font-ui);
		color: var(--text);
	}

	/*
	 * Pages get the whole window under the bar. One that wants the centred column wraps itself in
	 * `.page-column` (src/app.css).
	 */
	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		/* A little air between a full-width page and the edges of the window. */
		padding: 0 50px;
	}

	.corner {
		position: fixed;
		right: 20px;
		bottom: 20px;
		display: flex;
		gap: 10px;
	}

	.icon {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: rgb(4 3 3 / 0.92);
		color: var(--text);
		font-size: 1.3rem;
		line-height: 1;
	}

	.icon:hover,
	.icon:focus-visible {
		border-color: var(--accent);
	}

	/* Inline boxes sit on the text baseline, which pushes them off centre: make them blocks. */
	.icon svg,
	.icon span {
		display: block;
	}

	@media (max-width: 720px) {
		/* Too much to give up on a phone: pages keep their own small padding there. */
		main {
			padding: 0;
		}

		header {
			flex-wrap: wrap;
			gap: 0 20px;
			padding: 10px 16px 0;
		}

		nav {
			order: 3;
			flex-basis: 100%;
			overflow-x: auto;
		}

		.who {
			margin-left: auto;
		}
	}
</style>
