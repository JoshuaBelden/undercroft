<script lang="ts">
	import { device } from '#lib/game/input/device.svelte.ts';
	import { hints } from '#lib/game/input/hints.svelte.ts';
	import { isMenuButton, menuOf } from '#lib/game/input/menus.ts';
	import KeyCap from './KeyCap.svelte';

	/**
	 * A controller shortcut's button, inside the control it presses, before its label: only while
	 * the controller is the device in use, so keyboard and mouse players see nothing. A menu button
	 * (LB/RB, a hold) shows only while its menu is the one the controller drives. With `hold`, a
	 * ring around it fills while the button is held for this control (`data-pad-hold`, menus.ts).
	 * Space before the label: `--hint-gap` (0 by default, for a flex row with its own gap).
	 */
	interface Props {
		/** The button ("PadX", or a binding from `settings.padBindings`). Nothing shows for ''. */
		code: string;
		/** Held, not pressed: the ring. */
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
		{#if hold}
			<span class="ring">
				<svg viewBox="0 0 24 24">
					<circle class="track" cx="12" cy="12" r="10.5" />
					{#if progress > 0}
						<circle
							class="fill"
							cx="12"
							cy="12"
							r="10.5"
							pathLength="1"
							stroke-dasharray="1"
							stroke-dashoffset={1 - progress}
						/>
					{/if}
				</svg>
				<KeyCap {code} />
			</span>
		{:else}
			<KeyCap {code} />
		{/if}
	{/if}
</span>

<style>
	.hint {
		display: none;
	}

	/* Taller than a line of text, but it doesn't make the control any taller. */
	.hint.shown {
		display: inline-flex;
		flex: none;
		align-items: center;
		margin-block: -4px;
		margin-inline-end: var(--hint-gap, 0);
		vertical-align: middle;
	}

	.ring {
		position: relative;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
	}

	.ring svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		/* From the top, clockwise. */
		rotate: -90deg;
	}

	circle {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
	}

	.track {
		opacity: 0.3;
	}

	.fill {
		stroke-linecap: round;
	}
</style>
