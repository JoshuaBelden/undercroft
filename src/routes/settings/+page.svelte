<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { InputMap } from '#lib/game/input/InputMap.ts';
	import { parallax } from '#lib/ui/parallax.ts';
	import Settings from '#lib/ui/Settings.svelte';

	/** Reached from another page of the site (so "back" returns there), not opened directly. */
	let fromSite = false;
	afterNavigate(({ from }) => {
		fromSite = from !== null;
	});

	function close(): void {
		if (fromSite) history.back();
		else void goto(resolve('/(hub)'));
	}

	onMount(() => {
		// The key that opens the settings also leaves them; every other key is left to the page.
		const input = new InputMap(window, ['toggleSettings']);
		const unsubscribe = input.onPressed(close);
		return () => {
			unsubscribe();
			input.dispose();
		};
	});
</script>

<div class="page backdrop-art" use:parallax>
	<Settings onclose={close} />
</div>

<style>
	.page {
		min-height: 100vh;
	}
</style>
