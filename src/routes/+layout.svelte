<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { startGamepads } from '#lib/game/input/gamepad.ts';
	import { onMenuMove } from '#lib/game/input/menus.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { connection, start } from '#lib/game/net/connection.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import { toggleFullscreen, watchFullscreen } from '#lib/ui/fullscreen.svelte.ts';
	import { bugReport } from '#lib/game/crash.svelte.ts';
	import BugReport from '#lib/ui/BugReport.svelte';
	import CrashDialog from '#lib/ui/CrashDialog.svelte';
	import LaunchCountdown from '#lib/ui/LaunchCountdown.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/*
	 * Signed in, on any page: one connection to the game server, kept while moving between pages,
	 * so the party (and an expedition under way) survives it. See docs/dev/systems.md.
	 */
	$effect(() => {
		if (data.account) start();
	});

	/* The expedition has begun, or was already under way when the page loaded: go to it. */
	$effect(() => {
		if (connection.welcome && page.route.id !== '/play') void goto(resolve('/play'));
	});

	/*
	 * The menu click on every move between pages: links, keys, back and forward. Not into or out
	 * of an expedition (that is the descent, not a menu), and not when only the query changes.
	 */
	const audio = new AudioManager({ ...settings.audio });
	const sounds = new SoundBank(audio);

	onNavigate((navigation) => {
		const from = navigation.from?.route.id;
		const to = navigation.to?.route.id;
		if (!from || !to || from === to || from === '/play' || to === '/play') return;
		menuSound('ui.click');
	});

	// The controller moving the focus in a menu, anywhere: a quiet tick (docs/dev/controller.md).
	onMount(() => onMenuMove(() => menuSound('ui.focus')));

	function menuSound(id: 'ui.click' | 'ui.focus'): void {
		// Until the page is clicked or a key pressed, the browser keeps it silent (a controller
		// doesn't count): skip the sound rather than have them all play at the first click.
		if (!navigator.userActivation.hasBeenActive) return;
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play(id));
	}

	onMount(() => () => audio.dispose());

	/*
	 * In the game view Tab never moves the browser's focus: it is a game key there (by default the
	 * pack). Everywhere else (the dashboard, settings, account, sign-in) Tab moves between buttons
	 * and fields as usual. This is about the browser's own use of the key, not a binding, so it is
	 * named here; what Tab does goes through the input map as ever. Caught on the way down, so a
	 * dialog that keeps its keys to itself can't let it through.
	 */
	onMount(() => {
		const noFocusMove = (event: KeyboardEvent): void => {
			if (event.key === 'Tab' && page.route.id === '/play') event.preventDefault();
		};
		window.addEventListener('keydown', noFocusMove, true);
		return () => window.removeEventListener('keydown', noFocusMove, true);
	});

	/*
	 * Fullscreen on every page, the expedition included: the key is caught here, once, through an
	 * input map limited to it, so the pages' own input maps don't need to know about it.
	 */
	onMount(() => {
		const stop = watchFullscreen();
		const input = new InputMap(window, ['toggleFullscreen']);
		const unsubscribe = input.onPressed(toggleFullscreen);
		return () => {
			unsubscribe();
			input.dispose();
			stop();
		};
	});

	// Controllers are read every frame on every page (docs/dev/controller.md), once for the site.
	onMount(startGamepads);
</script>

<!--
	No browser menu on the alternate click, anywhere: that click belongs to the game (the item menu,
	aiming). Slots that have a menu of their own still get the event and open it.
-->
<svelte:window oncontextmenu={(event) => event.preventDefault()} />

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Undercroft</title>
</svelte:head>

{@render children()}

{#if page.route.id !== '/play'}
	<LaunchCountdown />
{/if}

<!-- Reports, on every page, underground too (docs/dev/reports.md). Only once signed in. -->
{#if data.account}
	<CrashDialog />
	{#if bugReport.open}
		<BugReport />
	{/if}
{/if}
