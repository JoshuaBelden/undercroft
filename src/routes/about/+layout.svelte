<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { BACKDROP_IMAGE } from '#lib/content/images.ts';
	import { GAME_VERSION } from '#lib/shared/version.ts';
	import { parallax } from '#lib/ui/parallax.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** Reached from another page of the site (so "back" returns there), not opened directly. */
	let fromSite = $state(false);
	afterNavigate(({ from }) => {
		if (from && !from.route.id?.startsWith('/about')) fromSite = true;
	});

	function back(): void {
		if (fromSite) history.back();
		else void goto(resolve(data.account ? '/(hub)' : '/auth/sign-in'));
	}

	const TABS = [
		{ path: '/about/changes', label: "What's new" },
		{ path: '/about/credits', label: 'Credits' }
	] as const;
</script>

<!-- Open without signing in (src/hooks.server.ts), so the sign-in page can link here. -->
<div class="about backdrop-art" style:--backdrop-image={BACKDROP_IMAGE} use:parallax>
	<header>
		<button type="button" class="back" onclick={back}>Back</button>
		<nav aria-label="About">
			{#each TABS as tab (tab.path)}
				<a
					href={resolve(tab.path)}
					class:current={page.route.id === tab.path}
					aria-current={page.route.id === tab.path ? 'page' : undefined}>{tab.label}</a
				>
			{/each}
		</nav>
		<span class="version">Undercroft {GAME_VERSION}</span>
	</header>
	<main class="page-column">
		{@render children()}
	</main>
</div>

<style>
	.about {
		min-height: 100vh;
	}

	header {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 12px 24px;
		background: rgb(10 9 8 / 0.78);
	}

	nav {
		display: flex;
		flex: 1;
		gap: 10px;
	}

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

	.back {
		font-size: 0.85rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.version {
		color: var(--muted);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		white-space: nowrap;
	}

	@media (max-width: 600px) {
		header {
			flex-wrap: wrap;
			gap: 10px 16px;
			padding: 10px 16px;
		}

		nav {
			order: 3;
			flex-basis: 100%;
		}

		.version {
			margin-left: auto;
		}
	}
</style>
