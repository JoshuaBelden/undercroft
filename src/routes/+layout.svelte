<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/*
	 * Tab never moves the browser's focus, anywhere: it is a game key (by default the pack
	 * underground and the Loadout page on the dashboard). This is about the browser's own use of
	 * the key, not a binding, so it is named here; what Tab does goes through the input map as ever.
	 * Caught on the way down, so a dialog that keeps its keys to itself can't let it through.
	 */
	onMount(() => {
		const noFocusMove = (event: KeyboardEvent): void => {
			if (event.key === 'Tab') event.preventDefault();
		};
		window.addEventListener('keydown', noFocusMove, true);
		return () => window.removeEventListener('keydown', noFocusMove, true);
	});
</script>

<!--
	No browser menu on the alternate click, anywhere: that click belongs to the game (the item menu,
	aiming). Slots that have a menu of their own still get the event and open it.
-->
<svelte:window oncontextmenu={(event) => event.preventDefault()} />

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- The typefaces behind the --font-* tokens in app.css. -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700&family=Barlow+Semi+Condensed:wght@400;600;700&family=Cinzel:wght@400;700&display=swap"
	/>
	<title>Undercroft</title>
</svelte:head>

{@render children()}
