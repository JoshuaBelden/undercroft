<script lang="ts">
	import { device } from '#lib/game/input/device.svelte.ts';
	import { hints } from '#lib/game/input/hints.svelte.ts';
	import { isMenuButton, menuOf } from '#lib/game/input/menus.ts';
	import KeyCap from './KeyCap.svelte';

	/**
	 * A controller shortcut's button, inside the control it presses, after its label: only while
	 * the controller is the device in use, so keyboard and mouse players see nothing. A menu button
	 * (LB/RB, a hold) shows only while its menu is the one the controller drives. It is drawn in
	 * the control's own colours (KeyCap's `tint="control"`: the control sets `--hint-cap` and
	 * `--hint-label`). With `hold`, a grey slide fills the control's background from the left while
	 * the button is held for it (`data-pad-hold`, menus.ts). Space after the label: `--hint-gap`
	 * (0 by default, for a flex row with its own gap).
	 */
	interface Props {
		/** The button ("PadX", or a binding from `settings.padBindings`). Nothing shows for ''. */
		code: string;
		/** Held, not pressed: the slide. */
		hold?: boolean;
	}

	let { code, hold = false }: Props = $props();

	let hint = $state<HTMLElement>();
	const shown = $derived(
		!!code &&
			device.kind === 'pad' &&
			(!isMenuButton(code) || (!!hint && hints.top !== null && menuOf(hint) === hints.top))
	);
	/** The control it sits in, held for (`data-pad-hold`). */
	const control = $derived(hold ? (hint?.closest<HTMLElement>('[data-pad-hold]') ?? null) : null);
	const progress = $derived(control && hints.target === control ? hints.progress : 0);
</script>

<!-- Only a picture of what the control's label says: screen readers have the label. -->
<span class="hint" class:shown bind:this={hint} aria-hidden="true">
	{#if shown}
		<KeyCap {code} tint="control" />
		{#if hold && progress > 0}
			<span class="slide" style:width="{progress * 100}%"></span>
		{/if}
	{/if}
</span>

<style>
	.hint {
		display: none;
	}

	.hint.shown {
		display: inline-flex;
		flex: none;
		align-items: center;
		margin-inline-start: var(--hint-gap, 0);
		vertical-align: middle;
	}

	/*
	 * The hold, across the whole control from its left edge, under its label: the control is the
	 * slide's box ([data-pad-hold] in app.css). Grey, as a crate's search bar fills.
	 */
	.slide {
		position: absolute;
		inset: 0 auto 0 0;
		z-index: -1;
		background: color-mix(in srgb, var(--muted) 50%, transparent);
		pointer-events: none;
	}
</style>
