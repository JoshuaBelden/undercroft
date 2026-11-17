<script lang="ts">
	import { resolve } from '$app/paths';
	import { isDesktop } from '#lib/desktop.ts';

	/**
	 * The desktop app for beta testers (a hosted build, docs/dev/desktop.md#the-beta-testers-build):
	 * where to get it, and a link that opens it once it is installed.
	 */
	const desktop = isDesktop();
</script>

<svelte:head>
	<title>Desktop app · Undercroft</title>
</svelte:head>

<h1>Desktop app</h1>

<section>
	{#if desktop}
		<p>You are playing in the desktop app.</p>
	{:else}
		<p>
			Play Undercroft in its own window on Windows. It is the same game as this site, with the same
			account: sign in the same way, and everything you keep is the same.
		</p>
		<p class="actions">
			<a class="button" href={resolve('/download')} data-sveltekit-reload>Download for Windows</a>
			<span class="size">About 115 MB</span>
		</p>
		<p>Already installed? <a href="undercroft://" rel="external">Open the desktop app</a>.</p>
	{/if}
</section>

<section>
	<h2>Installing it</h2>
	<ul>
		<li>Run <code>Undercroft-Setup.exe</code> and choose where to install it.</li>
		<li>
			Windows may say it protected your PC, because the installer isn't signed yet: choose More
			info, then Run anyway.
		</li>
		<li>
			The app shows the game as it is on this site, so it stays up to date by itself. Download it
			again only when we say a new desktop app is out.
		</li>
		<li>To close it, choose Quit game from the menu under your gamer tag.</li>
	</ul>
</section>

<style>
	h1 {
		margin: 0 0 24px;
		font-size: 2rem;
	}

	section {
		margin-bottom: 24px;
		padding: 20px 24px;
		background: rgb(20 17 15 / 0.9);
		border: 1px solid var(--border);
	}

	h2 {
		margin: 0 0 10px;
		font-size: 1.3rem;
	}

	p,
	li {
		margin: 8px 0;
		line-height: 1.55;
	}

	ul {
		margin: 0;
		padding-left: 20px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
		margin: 16px 0;
	}

	.button {
		padding: 8px 20px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-decoration: none;
	}

	.button:hover,
	.button:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	.size {
		color: var(--muted);
	}

	a {
		color: var(--text);
	}
</style>
