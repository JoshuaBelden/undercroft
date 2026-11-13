<script lang="ts">
	import { resolve } from '$app/paths';
	import { GAME_VERSION } from '#lib/shared/version.ts';
</script>

<!-- The version, with the way to the release notes and the credits: the sign-in page and the hub. -->
<p class="about-links">
	<span>Undercroft {GAME_VERSION}</span>
	<a href={resolve('/about/changes')}>What's new</a>
	<a href={resolve('/about/credits')}>Credits</a>
</p>

<style>
	.about-links {
		display: flex;
		gap: 14px;
		margin: 0;
		color: var(--muted);
		font-family: var(--font-ui);
		font-size: 0.8rem;
		text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
	}

	a {
		color: var(--muted);
	}

	a:hover,
	a:focus-visible {
		color: var(--text);
	}
</style>
