<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import '../../../src/app.css';
	import '../app.css';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** The sections, in the order of the sidebar. */
	const NAV = [
		{ path: '/', label: 'Dashboard' },
		{ path: '/members', label: 'Members' },
		{ path: '/reports', label: 'Bug reports' },
		{ path: '/crashes', label: 'Crashes' },
		{ path: '/ideas', label: 'Ideas' },
		{ path: '/feedback', label: 'Feedback' },
		{ path: '/audit', label: 'Audit log' }
	] as const;

	const current = (path: string): boolean =>
		path === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(path);
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700&display=swap"
	/>
</svelte:head>

{#if data.admin}
	<div class="shell">
		<aside>
			<p class="brand">Undercroft <span>Admin</span></p>
			<nav aria-label="Sections">
				{#each NAV as item (item.path)}
					<a href={resolve(item.path)} aria-current={current(item.path) ? 'page' : undefined}>
						{item.label}
					</a>
				{/each}
			</nav>
			<form method="POST" action={resolve('/sign-out')} class="who">
				<span>{data.admin.gamerTag}</span>
				<button type="submit">Sign out</button>
			</form>
		</aside>
		<main>{@render children()}</main>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		min-height: 100vh;
	}

	aside {
		background: var(--panel);
		border-right: 1px solid var(--border);
		padding: 20px 14px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.brand {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
	}

	.brand span {
		color: var(--accent);
	}

	nav {
		display: grid;
		gap: 2px;
	}

	nav a {
		color: var(--text);
		text-decoration: none;
		padding: 7px 10px;
		border-radius: 4px;
	}

	nav a:hover {
		background: rgb(255 255 255 / 0.04);
	}

	nav a[aria-current='page'] {
		background: rgb(0 129 157 / 0.18);
		color: #fff;
	}

	.who {
		margin-top: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		color: var(--muted);
	}

	main {
		padding: 24px 28px;
		min-width: 0;
	}

	main :global(h1) {
		margin: 0 0 18px;
		font-size: 30px;
	}

	/* A phone: the sidebar becomes a bar across the top. */
	@media (max-width: 720px) {
		.shell {
			grid-template-columns: 1fr;
		}

		aside {
			border-right: none;
			border-bottom: 1px solid var(--border);
		}

		nav {
			grid-auto-flow: column;
			overflow-x: auto;
		}

		main {
			padding: 16px;
		}
	}
</style>
