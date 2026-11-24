<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { loadAccount, session } from '#lib/account/account.svelte.ts';
	import { money } from '#lib/content/economy.ts';
	import { LEVELS } from '#lib/content/progression.ts';
	import { levelOf, pointsLeft } from '#lib/shared/progression/progression.ts';
	import { QUEST_ORDER, QUESTS } from '#lib/content/quests.ts';
	import { committable } from '#lib/shared/items/inventory.ts';
	import { canComplete, status } from '#lib/shared/quests/engine.ts';
	import { BACKDROP_IMAGE, imageUrl } from '#lib/content/images.ts';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import { connection, me } from '#lib/game/net/connection.svelte.ts';
	import { startPrefetch } from '#lib/game/prefetch.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import AccountMenu from '#lib/ui/AccountMenu.svelte';
	import ButtonHint from '#lib/ui/ButtonHint.svelte';
	import KeyCap from '#lib/ui/KeyCap.svelte';
	import { device } from '#lib/game/input/device.svelte.ts';
	import HelpScreen from '#lib/ui/HelpScreen.svelte';
	import { launch } from '#lib/ui/launch.svelte.ts';
	import { parallax } from '#lib/ui/parallax.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let help = $state(false);
	/** On the Social page (friends, the party, invites). */
	const social = $derived(page.route.id === '/(hub)/social');
	/** On the Store or Loadout page: their controller shortcuts do nothing there (no toggles). */
	const store = $derived(page.route.id === '/(hub)/store');
	const loadout = $derived(page.route.id === '/(hub)/loadout');
	/** Friend requests and party invites waiting for an answer: the number on the social button. */
	const waiting = $derived(
		(connection.social?.incoming.length ?? 0) + (connection.social?.invites.length ?? 0)
	);
	/** Ready to descend: the store is closed until they cancel. */
	const ready = $derived(me()?.ready ?? false);
	/** How tall the bar is, for pages that put something right under it (`--hub-bar`). */
	let bar = $state(0);

	const explorer = $derived(session.account?.explorer ?? null);
	/**
	 * Quests ready to report, or done but for committing what is already in hand: the number on
	 * the Contacts tab.
	 */
	const toReport = $derived.by(() => {
		if (!explorer) return 0;
		const context = {
			resolved: (id: string) => explorer.afflictions.some((a) => a.id === id && a.resolved)
		};
		const have = (item: string) => committable(explorer.stash, explorer.loadout, item);
		return QUEST_ORDER.filter((id) => {
			const s = status(explorer.quests, id, context);
			return s === 'ready' || (s === 'open' && canComplete(explorer.quests, QUESTS[id], have));
		}).length;
	});
	const gamerTag = $derived(session.account?.gamerTag ?? data.account?.gamerTag ?? '');
	const avatar = $derived(session.account?.avatar ?? null);

	/** The dashboard's screens, in the order of the tabs. The store is reached from the money. */
	const ALL_TABS = [
		{ path: '/(hub)', label: 'Expedition' },
		{ path: '/(hub)/explorer', label: 'Explorer' },
		{ path: '/(hub)/contacts', label: 'Contacts' },
		{ path: '/(hub)/afflictions', label: 'Afflictions' },
		{ path: '/(hub)/workshop', label: 'Workshop' },
		{ path: '/(hub)/library', label: 'Library' }
	] as const;
	const TABS = ALL_TABS;
	const level = $derived(levelOf(explorer?.progression.xp ?? 0));
	/** The skill tree is hidden until level 1 (docs/dev/progression.md); the level beside the avatar opens it. */
	const treeOpen = $derived(level >= LEVELS.treeAt);
	/** Skill points not yet spent: the level turns yellow and throbs until they are. */
	const unspent = $derived(explorer ? pointsLeft({ ...explorer.progression, firsts: [] }) : 0);
	const skillsPage = $derived(page.route.id === '/(hub)/skills');

	/** The tab a page is under: its own, or the one it is a page of (a contact under Contacts). */
	function under(path: string): boolean {
		const at = page.route.id ?? '';
		return at === path || (path !== '/(hub)' && at.startsWith(path + '/'));
	}

	/** The controller's B: from a contact back to Contacts, from anywhere else to the Expedition page. */
	function up(): void {
		if (page.route.id === '/(hub)/contacts/[npc]') void goto(resolve('/(hub)/contacts'));
		else if (page.route.id !== '/(hub)') void goto(resolve('/(hub)'));
	}

	/** The controller's LB/RB: the tab before or after, round (from the store or social, the ends). */
	function switchTab(by: -1 | 1): void {
		const at = TABS.findIndex((tab) => under(tab.path));
		const next = at < 0 ? (by > 0 ? 0 : TABS.length - 1) : (at + by + TABS.length) % TABS.length;
		const tab = TABS[next];
		if (tab) void goto(resolve(tab.path));
	}

	onMount(() => {
		void loadAccount();
		// Shared models and sounds download in the background, so the descent loads quickly.
		startPrefetch();
		// Only these actions: every other key and click is left to the page. `inventory` (Tab) goes
		// to the Loadout page, as its pill says; typing in a field keeps Tab for the field.
		const input = new InputMap(window, [
			'toggleSettings',
			'toggleHelp',
			'toggleSocial',
			'inventory'
		]);
		const unsubscribe = input.onPressed((action, from) => {
			// The key backs out one step: it closes Help, then returns to the Expedition page, and
			// only from there opens the settings page.
			if (action === 'toggleSettings') {
				if (help) help = false;
				else if (page.route.id !== '/(hub)') void goto(resolve('/(hub)'));
				else void goto(resolve('/settings'));
			}
			if (action === 'toggleHelp') help = !help;
			// To the Social page; from there, the same key goes back to the party. The controller's
			// button only opens it: B goes back.
			if (action === 'toggleSocial') {
				help = false;
				if (!social) void goto(resolve('/(hub)/social'));
				else if (from === 'keyboard') void goto(resolve('/(hub)'));
			}
			// Its key (Tab) or the controller's View: the Loadout page. Not a toggle: B goes back.
			if (action === 'inventory') {
				help = false;
				if (!loadout) void goto(resolve('/(hub)/loadout'));
			}
		});
		return () => {
			unsubscribe();
			input.dispose();
		};
	});
</script>

<div
	class="hub backdrop-art"
	style:--hub-bar="{bar}px"
	style:--backdrop-image={BACKDROP_IMAGE}
	use:parallax
	{@attach menu({ back: up, tabs: switchTab, key: page.route.id ?? undefined })}
>
	<header bind:clientHeight={bar}>
		<!-- The game's mark, far left: home, the Expedition page. -->
		<a class="mark" href={resolve('/(hub)')} title="Undercroft">
			<img src={imageUrl('icon')} alt="Undercroft" width="36" height="36" />
		</a>
		<nav aria-label="Dashboard">
			<!-- The controller's shortcuts show their buttons while it is in use (ButtonHint). -->
			<ButtonHint code="PadLB" />
			{#each TABS as tab (tab.path)}
				<a
					href={resolve(tab.path)}
					class:current={under(tab.path)}
					aria-current={under(tab.path) ? 'page' : undefined}
				>
					{tab.label}
					{#if tab.path === '/(hub)/contacts' && toReport > 0}
						<span class="badge" aria-label="{toReport} ready to report">{toReport}</span>
					{/if}
				</a>
			{/each}
			<ButtonHint code="PadRB" />
		</nav>
		<div class="who">
			{#if explorer && ready}
				<!-- Ready to descend: the store is closed, so the money is not a link. -->
				<span
					class="coins closed"
					aria-label="You have {money(explorer.money)}. The store is closed while you are ready"
					title="The store is closed while you are ready to descend"
				>
					<span class="sign" aria-hidden="true">＄</span>
					<span aria-hidden="true">{explorer.money}</span>
				</span>
			{:else if explorer}
				<!-- Held Y opens it from every other page (menus.ts, data-pad-hold). -->
				<a
					class="coins"
					class:current={store}
					href={resolve('/(hub)/store')}
					aria-label="Store: you have {money(explorer.money)}"
					aria-current={store ? 'page' : undefined}
					title="Store"
					data-pad-hold={store || launch.free ? undefined : 'y'}
				>
					<span class="sign" aria-hidden="true">＄</span>
					<span aria-hidden="true">{explorer.money}</span>
					{#if !store && !launch.free}
						<ButtonHint code="PadY" hold />
					{/if}
				</a>
			{/if}
			{#if treeOpen}
				<a
					class="level"
					class:current={skillsPage}
					class:unspent={unspent > 0}
					href={resolve('/(hub)/skills')}
					aria-label={unspent > 0
						? `Skills: level ${level}, ${unspent} skill point${unspent === 1 ? '' : 's'} to spend`
						: `Skills: level ${level}`}
					aria-current={skillsPage ? 'page' : undefined}
					title="Skills"
				>
					<span aria-hidden="true"><span class="word">Level</span> {level}</span>
				</a>
			{/if}
			<AccountMenu {gamerTag} {avatar} />
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<!-- The release notes and the credits, bottom left: the social button's style. -->
	<div class="about">
		<a class="pill" href={resolve('/about/changes')} title="What changed in each version">
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
				<path
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linejoin="round"
					d="M12 2.5l2.3 6.2 6.2 2.3-6.2 2.3-2.3 6.2-2.3-6.2-6.2-2.3 6.2-2.3z"
				/>
			</svg>
			<span>What's new</span>
		</a>
		<a class="pill" href={resolve('/about/credits')} title="Who made Undercroft, and with what">
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
				<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
				<path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 10.5v6M12 7v1.2" />
			</svg>
			<span>Credits</span>
		</a>
		<!-- The Loadout page, out of the tabs: its key (Tab) on the pill, or the controller's View. -->
		<a
			class="pill"
			class:open={loadout}
			href={resolve('/(hub)/loadout')}
			aria-current={loadout ? 'page' : undefined}
			title="What you take down, and your stash"
		>
			{#if device.kind !== 'pad' && settings.bindings.inventory[0]}
				<KeyCap code={settings.bindings.inventory[0]} tint="control" />
			{/if}
			<span>Loadout</span>
			{#if !loadout}
				<ButtonHint code={settings.padBindings.inventory[0] ?? ''} />
			{/if}
		</a>
	</div>

	<div class="corner">
		<a
			class="pill"
			class:open={social}
			href={resolve('/(hub)/social')}
			aria-label={waiting > 0 ? `Social: ${waiting} waiting for an answer` : 'Social'}
			aria-current={social ? 'page' : undefined}
			title="Friends, your party and invites"
		>
			<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
				<path
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linejoin="round"
					d="M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-8.2L7 21.5v-4H4A1.5 1.5 0 0 1 2.5 16V6A1.5 1.5 0 0 1 4 4.5z"
				/>
			</svg>
			<span>Social</span>
			{#if waiting > 0}
				<span class="badge" aria-hidden="true">{waiting}</span>
			{/if}
			{#if !social}
				<ButtonHint code={settings.padBindings.toggleSocial[0] ?? ''} />
			{/if}
		</a>
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
	<HelpScreen onclose={() => (help = false)} />
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

	.mark {
		display: block;
		flex: none;
		border-radius: 50%;
	}

	.mark img {
		display: block;
		object-fit: contain;
	}

	.mark:hover img,
	.mark:focus-visible img {
		filter: brightness(1.2);
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
		/* Its controller button: the blue cap, the letter dark as the bar. */
		--hint-gap: 8px;
		--hint-cap: var(--accent);
		--hint-label: var(--bg);
	}

	.coins:hover,
	.coins:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	.coins.current {
		border-color: var(--accent);
	}

	.coins.closed {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.coins.closed:hover {
		background: none;
	}

	.sign {
		margin-right: -0.12em;
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

	/* The version and the way to the release notes and credits, out of the way. */
	.about {
		position: fixed;
		left: 20px;
		bottom: 20px;
		display: flex;
		gap: 10px;
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

	/* The social button: a pill to the left of the round ones, with its name and what is waiting. */
	.pill {
		height: 44px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 16px 0 14px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: rgb(4 3 3 / 0.92);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-decoration: none;
		text-transform: uppercase;
	}

	.pill:hover,
	.pill:focus-visible,
	.pill.open {
		border-color: var(--accent);
	}

	/* The explorer's level, shaped as the money: it opens the Skills page. */
	.level {
		display: flex;
		align-items: center;
		padding: 2px 14px;
		border: 1px solid transparent;
		border-radius: 999px;
		color: var(--text);
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
		text-decoration: none;
	}

	.level:hover,
	.level:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	/* "Level", smaller than the number it names. */
	.level .word {
		font-size: 0.6em;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.level.current {
		border-color: var(--accent);
	}

	/* Skill points to spend: yellow, and a slow throb until they are. */
	.level.unspent {
		color: var(--launch-bright);
		animation: throb 1.6s ease-in-out infinite;
	}

	@keyframes throb {
		0%,
		100% {
			scale: 1;
		}
		50% {
			scale: 1.08;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.level.unspent {
			animation: none;
		}
	}

	.pill svg {
		display: block;
	}

	.badge {
		min-width: 20px;
		padding: 2px 6px;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.75rem;
		letter-spacing: 0;
		text-align: center;
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
