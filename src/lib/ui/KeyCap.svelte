<script lang="ts">
	import { bindingLabel } from '#lib/game/input/actions.ts';
	import { padFamily } from '#lib/game/input/device.svelte.ts';

	/**
	 * A binding shown on screen. A key is a small white rounded cap with the key's label in bold
	 * black. A controller button is drawn in the same style, in the current icon set (`padFamily`):
	 * round face buttons (letters, or PlayStation's shapes), the d-pad with the pressed arm dark,
	 * the rest by name. Pass the binding's code (`promptCode`), so it follows remapping and the
	 * device in use.
	 */
	interface Props {
		/** The binding, e.g. "KeyF" or "PadA". */
		code: string;
		/** small: beside HUD bars (the default). large: in a hold prompt. */
		size?: 'small' | 'large';
	}

	let { code, size = 'small' }: Props = $props();

	/** Face buttons' colours: Xbox style and PlayStation. */
	const FACES: Record<string, readonly [string, string]> = {
		PadA: ['#3d8b3d', '#4a6fc0'],
		PadB: ['#b8392f', '#c0443a'],
		PadX: ['#2f63b8', '#b0559c'],
		PadY: ['#a8862a', '#2f9a7c']
	};
	/** PlayStation's face shapes, in a 10 x 10 box. */
	const SHAPES: Record<string, string> = {
		PadA: 'M2.6 2.6l4.8 4.8M7.4 2.6l-4.8 4.8',
		PadB: 'M5 2.2a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 1 1 0-5.6z',
		PadX: 'M2.5 2.5h5v5h-5z',
		PadY: 'M5 2.1l3.1 5.4H1.9z'
	};
	/** The d-pad arm each direction lights, as a turn from up. */
	const DPAD: Record<string, number> = { PadUp: 0, PadRight: 90, PadDown: 180, PadLeft: 270 };

	const family = $derived(padFamily());
	const label = $derived(bindingLabel(code, family));
	const face = $derived(FACES[code]?.[family === 'playstation' ? 1 : 0]);
	const turn = $derived(DPAD[code]);
</script>

{#if face}
	<kbd class="key face" class:large={size === 'large'} style:color={face}>
		{#if family === 'playstation'}
			<svg viewBox="0 0 10 10" role="img" aria-label={label}><path d={SHAPES[code]} /></svg>
		{:else}
			{label}
		{/if}
	</kbd>
{:else if turn !== undefined}
	<kbd class="key dpad" class:large={size === 'large'}>
		<svg viewBox="0 0 10 10" role="img" aria-label={label}>
			<path class="cross" d="M4 1h2v3h3v2H6v3H4V6H1V4h3z" />
			<path class="arm" d="M4 1h2v3H4z" transform="rotate({turn} 5 5)" />
		</svg>
	</kbd>
{:else}
	<kbd class="key" class:wide={label.length > 1} class:large={size === 'large'}>{label}</kbd>
{/if}

<style>
	.key {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		min-width: 14px;
		height: 14px;
		padding: 0 2px;
		border: 1px solid rgb(0 0 0 / 0.55);
		border-radius: 3px;
		background: #f2f0ea;
		box-shadow: 0 1px 0 rgb(0 0 0 / 0.5);
		color: #111;
		font: 700 9px/1 var(--font-ui);
		letter-spacing: 0;
		text-transform: none;
	}

	.key.wide {
		padding: 0 3px;
	}

	.key.large {
		min-width: 24px;
		height: 24px;
		padding: 0 5px;
		border-radius: 5px;
		box-shadow: 0 2px 0 rgb(0 0 0 / 0.5);
		font-size: 14px;
	}

	/* Controller face buttons are round; the colour is the letter's, or the shape's. */
	.key.face,
	.key.dpad {
		width: 14px;
		padding: 0;
	}

	.key.face {
		border-radius: 50%;
	}

	.key.face.large,
	.key.dpad.large {
		width: 24px;
		padding: 0;
	}

	.key.face.large {
		border-radius: 50%;
	}

	svg {
		width: 10px;
		height: 10px;
	}

	.large svg {
		width: 16px;
		height: 16px;
	}

	.face path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linejoin: round;
	}

	.dpad .cross {
		fill: #b9b6ad;
	}

	.dpad .arm {
		fill: #111;
	}
</style>
