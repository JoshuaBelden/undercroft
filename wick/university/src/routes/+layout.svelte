<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { CHAPTERS } from '#university/chapters.ts';

	let { children } = $props();

	const current = $derived(CHAPTERS.find((chapter) => chapter.path === page.url.pathname));
</script>

<svelte:head>
	<title>{current ? `${current.title} · WICK University` : 'WICK University'}</title>
</svelte:head>

<div class="shell">
	<nav aria-label="Chapters">
		<a class="brand" href={resolve('/')}>
			<span class="mark">WICK</span>
			<span class="sub">University</span>
		</a>
		<ol>
			{#each CHAPTERS as chapter (chapter.path)}
				<li>
					{#if chapter.ready}
						<a href={resolve(chapter.path)} aria-current={chapter === current ? 'page' : undefined}
							>{chapter.title}</a
						>
					{:else}
						<span class="coming" title="Written when its package moves into WICK"
							>{chapter.title}</span
						>
					{/if}
				</li>
			{/each}
		</ol>
	</nav>
	<main>
		{@render children()}
	</main>
</div>

<style>
	:global(:root) {
		--bg: #fbfaf7;
		--panel: #f1eee7;
		--ink: #23211d;
		--muted: #6b665c;
		--rule: #dcd6ca;
		--accent: #b4561f;
		--accent-soft: #f3dfd0;
		--code-bg: #f1eee7;
		--node: #ffffff;
		--world: #3d6e8f;
		--dry: #7a5a9c;
		color-scheme: light dark;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #16151a;
			--panel: #1e1d23;
			--ink: #e9e6df;
			--muted: #a29d93;
			--rule: #34323a;
			--accent: #f08a4b;
			--accent-soft: #3a2a20;
			--code-bg: #1e1d23;
			--node: #24232a;
			--world: #7fb2d4;
			--dry: #b99ad8;
		}
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--ink);
		font:
			16px/1.6 system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}
	:global(main h1) {
		font-size: 2.1rem;
		line-height: 1.2;
		margin: 0 0 0.4rem;
	}
	:global(main h2) {
		font-size: 1.35rem;
		margin: 2.6rem 0 0.6rem;
		padding-top: 1rem;
		border-top: 1px solid var(--rule);
	}
	:global(main h3) {
		font-size: 1.05rem;
		margin: 1.6rem 0 0.4rem;
	}
	:global(main p),
	:global(main li) {
		max-width: 46rem;
	}
	:global(main a) {
		color: var(--accent);
	}
	:global(main code) {
		font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
		font-size: 0.88em;
		background: var(--code-bg);
		padding: 0.1em 0.35em;
		border-radius: 4px;
	}
	:global(main table) {
		border-collapse: collapse;
		margin: 1rem 0;
		font-size: 0.94rem;
	}
	:global(main th),
	:global(main td) {
		text-align: left;
		vertical-align: top;
		padding: 0.45rem 0.8rem;
		border-bottom: 1px solid var(--rule);
	}
	:global(main th) {
		color: var(--muted);
		font-weight: 600;
	}
	:global(.lede) {
		font-size: 1.15rem;
		color: var(--muted);
		max-width: 44rem;
	}

	.shell {
		display: grid;
		grid-template-columns: 15rem 1fr;
		min-height: 100vh;
	}
	nav {
		background: var(--panel);
		border-right: 1px solid var(--rule);
		padding: 1.6rem 1.2rem;
		position: sticky;
		top: 0;
		height: 100vh;
		box-sizing: border-box;
	}
	.brand {
		display: flex;
		flex-direction: column;
		text-decoration: none;
		color: var(--ink);
		margin-bottom: 1.6rem;
	}
	.mark {
		font-weight: 800;
		font-size: 1.6rem;
		letter-spacing: 0.12em;
		color: var(--accent);
	}
	.sub {
		font-size: 0.85rem;
		color: var(--muted);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.15rem;
	}
	ol a,
	.coming {
		display: block;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		text-decoration: none;
	}
	ol a {
		color: var(--ink);
	}
	ol a:hover {
		background: var(--accent-soft);
	}
	ol a[aria-current='page'] {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	.coming {
		color: var(--muted);
		opacity: 0.6;
		cursor: default;
	}
	main {
		padding: 2.6rem 3rem 5rem;
		min-width: 0;
	}
	@media (max-width: 760px) {
		.shell {
			grid-template-columns: 1fr;
		}
		nav {
			position: static;
			height: auto;
		}
		main {
			padding: 1.6rem 1.2rem 4rem;
		}
	}
</style>
