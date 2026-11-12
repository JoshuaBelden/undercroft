<script lang="ts">
	/**
	 * A keyboard key shown on screen: a small white rounded cap with the key's label in bold black.
	 * Pass the label from the player's current binding (`bindingLabel`), so it follows remapping.
	 */
	interface Props {
		/** What is printed on the key, e.g. "F". */
		label: string;
		/** small: beside HUD bars (the default). large: in a hold prompt. */
		size?: 'small' | 'large';
	}

	let { label, size = 'small' }: Props = $props();
</script>

<kbd class="key" class:wide={label.length > 1} class:large={size === 'large'}>{label}</kbd>

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
</style>
