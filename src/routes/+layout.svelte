<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import '../app.css';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { startGamepads } from '#lib/game/input/gamepad.ts';
	import { BUTTON, onMenuHold, onMenuMove, onMenuPress } from '#lib/game/input/menus.ts';
	import { AudioManager } from '#lib/game/audio/AudioManager.ts';
	import { SoundBank } from '#lib/game/audio/SoundBank.ts';
	import { FadingLoop } from '#lib/game/audio/FadingLoop.ts';
	import { connection, start } from '#lib/game/net/connection.svelte.ts';
	import { settings } from '#lib/settings/settings.svelte.ts';
	import { toggleFullscreen, watchFullscreen } from '#lib/ui/fullscreen.svelte.ts';
	import { bugReport } from '#lib/game/crash.svelte.ts';
	import BugReport from '#lib/ui/BugReport.svelte';
	import { diagnosticsRun } from '#lib/game/benchmark/state.svelte.ts';
	import Diagnostics from '#lib/ui/Diagnostics.svelte';
	import CrashDialog from '#lib/ui/CrashDialog.svelte';
	import LaunchCountdown from '#lib/ui/LaunchCountdown.svelte';
	import Alerts from '#lib/ui/Alerts.svelte';
	import { onAlertSound } from '#lib/game/alerts.svelte.ts';
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

	/** When a button press last sounded: a button that goes to another page sounds once, as a press. */
	let pressedAt = -Infinity;
	/** How soon after a button press a move between pages is taken to be that press's. */
	const PRESS_LEADS = 300;

	onNavigate((navigation) => {
		const from = navigation.from?.route.id;
		const to = navigation.to?.route.id;
		if (!from || !to || from === to || from === '/play' || to === '/play') return;
		if (performance.now() - pressedAt < PRESS_LEADS) return;
		menuSound('ui.nav');
	});

	/*
	 * A button pressed, on any page: by a click, or Enter or Space on the focused one. Only the
	 * player's own presses (trusted): a page clicking a button itself makes no sound. Not while the
	 * pointer is locked, aiming underground. The controller's A is `onMenuPress` below.
	 */
	function pressed(event: MouseEvent): void {
		if (!event.isTrusted || document.pointerLockElement) return;
		if (!(event.target instanceof Element) || !event.target.closest(BUTTON)) return;
		buttonSound();
	}

	function buttonSound(): void {
		pressedAt = performance.now();
		menuSound('ui.button');
	}

	// The controller moving the focus in a menu, anywhere, or stepping a value with the right
	// stick: the move, quieter (docs/dev/controller.md).
	onMount(() => onMenuMove((tick) => menuSound(tick === 'step' ? 'ui.step' : 'ui.focus')));
	// Its A pressing a button, and a button held in a menu pressing its control (Launch, the store).
	onMount(() => onMenuPress(buttonSound));
	onMount(() =>
		onMenuHold(() => {
			pressedAt = performance.now();
			menuSound('ui.hold');
		})
	);

	// An alert coming in (docs/dev/alerts.md): a soft chime, on every page.
	onMount(() => onAlertSound(() => menuSound('ui.alert')));

	function menuSound(
		id: 'ui.nav' | 'ui.button' | 'ui.focus' | 'ui.step' | 'ui.hold' | 'ui.alert'
	): void {
		// Until the page is clicked or a key pressed, the browser keeps it silent (a controller
		// doesn't count): skip the sound rather than have them all play at the first click.
		if (!navigator.userActivation.hasBeenActive) return;
		for (const category of ['master', 'sfx'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
		void audio.unlock().then(() => sounds.play(id));
	}

	/*
	 * The ambient bed on every page off the expedition (docs/dev/player.md#surface-ambience). It
	 * fades out as the descent begins and back in on return. It follows the Master and Ambience
	 * volumes as they change on the settings page.
	 */
	const ambience = new FadingLoop(sounds, 'ambience.dashboard', { in: 3, out: 1.5 });

	$effect(() => {
		for (const category of ['master', 'ambience'] as const) {
			audio.setVolume(category, settings.audio[category]);
		}
	});

	$effect(() => ambience.setWanted(page.route.id !== '/play'));

	/*
	 * The browser keeps the page silent until its first click or key (a controller doesn't count),
	 * so the bed waits for one. A touch only counts as it lifts, hence `pointerup` too.
	 */
	onMount(() => {
		const events = ['pointerdown', 'pointerup', 'keydown'] as const;
		const stopWaiting = (): void => {
			for (const event of events) window.removeEventListener(event, begin, true);
		};
		function begin(): void {
			if (!navigator.userActivation.hasBeenActive) return;
			stopWaiting();
			void audio.unlock().then(() => ambience.allow());
		}
		begin();
		if (!navigator.userActivation.hasBeenActive) {
			for (const event of events) window.addEventListener(event, begin, true);
		}
		return stopWaiting;
	});

	onMount(() => () => {
		ambience.dispose();
		audio.dispose();
	});

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
	aiming). Slots that have a menu of their own still get the event and open it. Every button
	pressed sounds (caught on the way down, so a button that stops its click still does).
-->
<svelte:window oncontextmenu={(event) => event.preventDefault()} onclickcapture={pressed} />

<svelte:head>
	<title>Undercroft</title>
</svelte:head>

{@render children()}

{#if page.route.id !== '/play'}
	<LaunchCountdown />
{/if}

<!-- Reports, on every page, underground too (docs/dev/reports.md). Only once signed in. -->
{#if data.account}
	<!-- Alerts, the same (docs/dev/alerts.md). -->
	<Alerts />
	<CrashDialog />
	{#if bugReport.open}
		<BugReport />
	{/if}
	<!-- Run Diagnostics, from the account menu (docs/dev/diagnostics.md). -->
	{#if diagnosticsRun.open}
		<Diagnostics />
	{/if}
{/if}
