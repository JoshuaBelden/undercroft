<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { BACKDROP_IMAGE } from '#lib/content/images.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import { GAME_VERSION } from '#lib/shared/version.ts';
	import { parallax } from '#lib/ui/parallax.ts';

	let { children } = $props();

	const TABS = [
		{ path: '/about/changes', label: "What's new" },
		{ path: '/about/credits', label: 'Credits' }
	] as const;

	/** The controller's B: to the dashboard, as Back is. */
	function back(): void {
		void goto(resolve('/(hub)'));
	}

	/** The controller's LB/RB: the tab before or after, round. */
	function switchTab(by: -1 | 1): void {
		const at = TABS.findIndex((tab) => tab.path === page.route.id);
		const tab = TABS[(at + by + TABS.length) % TABS.length];
		if (tab) void goto(resolve(tab.path));
	}
</script>

<!-- Open without signing in (src/hooks.server.ts), so the sign-in page can link here. -->
<div
	class="about backdrop-art"
	style:--backdrop-image={BACKDROP_IMAGE}
	use:parallax
	{@attach menu({ back, tabs: switchTab, key: page.route.id ?? undefined })}
>
	<header>
		<nav aria-label="About">
			{#each TABS as tab (tab.path)}
				<a
					href={resolve(tab.path)}
					class:current={page.route.id === tab.path}
					aria-current={page.route.id === tab.path ? 'page' : undefined}>{tab.label}</a
				>
			{/each}
		</nav>
		<span class="version">
			{#if page.route.id === '/about/changes'}Undercroft {GAME_VERSION}{/if}
		</span>
		<!-- Always to the dashboard (signed out, that sends you on to sign in). -->
		<a class="back" href={resolve('/(hub)')}>Back</a>
	</header>
	<main class="page-column">
		{@render children()}
	</main>
</div>

<style>
	.about {
		min-height: 100vh;
	}

	/* Tabs left, the version in the middle, Back right, like the settings screen's bar. */
	header {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 20px;
		padding: 12px 24px;
		background: rgb(10 9 8 / 0.78);
	}

	nav {
		display: flex;
		gap: 10px;
	}

	nav a,
	.back {
		padding: 6px 16px;
		border: 1px solid transparent;
		border-radius: 999px;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-decoration: none;
		white-space: nowrap;
		color: var(--text);
	}

	nav a:hover,
	nav a:focus-visible,
	.back:hover,
	.back:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	nav a.current {
		border-color: var(--text);
	}

	.back {
		justify-self: end;
		border-color: var(--border);
	}

	.version {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		white-space: nowrap;
	}

	@media (max-width: 600px) {
		header {
			grid-template-columns: 1fr auto;
			padding: 10px 16px;
		}

		.version {
			grid-row: 2;
			grid-column: 1 / -1;
			justify-self: center;
		}
	}
</style>
