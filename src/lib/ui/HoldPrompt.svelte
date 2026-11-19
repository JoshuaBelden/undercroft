<script lang="ts">
	import KeyCap from './KeyCap.svelte';

	/**
	 * Prompt for a hold-key action ("Hold E to climb out"): a pill whose background fills as the
	 * key is held. Use it for every hold prompt so they all look the same. With `key` it shows that
	 * key after the text if there is any, in the pill's own colours (KeyCap's `tint="control"`).
	 */
	interface Props {
		text: string;
		/** The binding to show as a keycap or controller button ("KeyE", "PadX"; see KeyCap). */
		key?: string | null;
		/** 0..1 hold progress; 0 shows the empty pill. */
		progress?: number;
		/** It can't be done yet (a lock with no key, a jam with no crowbar): the pill turns red. */
		blocked?: boolean;
		/** Words after the key ("(crate stuck)"). */
		after?: string | null;
	}

	let { text, key = null, progress = 0, blocked = false, after = null }: Props = $props();
</script>

<div class="pill" class:holding={progress > 0} class:blocked role="status">
	<div class="fill" style:width="{Math.min(1, Math.max(0, progress)) * 100}%"></div>
	{#if text}<span class="text">{text}</span>{/if}
	{#if key}<span class="cap"><KeyCap code={key} size="large" tint="control" /></span>{/if}
	{#if after}<span class="text">{after}</span>{/if}
</div>

<style>
	.pill {
		/* The keycap in the pill's colours: its text for the cap, its background for the letter. */
		--hint-cap: #f1e9da;
		--hint-label: rgb(10 8 6);
		position: relative;
		display: flex;
		gap: 10px;
		align-items: center;
		overflow: hidden;
		padding: 10px 24px;
		border: 1.5px solid rgb(230 220 203 / 0.55);
		border-radius: 999px;
		background: rgb(10 8 6 / 0.65);
		box-shadow: 0 0 18px rgb(0 0 0 / 0.6);
	}

	.pill.holding {
		border-color: rgb(230 220 203 / 0.85);
	}

	.pill.blocked {
		--hint-cap: #e7a397;
		border-color: rgb(196 72 58 / 0.85);
		background: rgb(48 10 8 / 0.72);
	}

	.pill.blocked .text {
		color: #e7a397;
	}

	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: rgb(230 220 190 / 0.28);
	}

	.cap {
		position: relative;
		display: flex;
	}

	.text {
		position: relative;
		font: 700 16px var(--font-ui);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #f1e9da;
		text-shadow: 0 0 6px rgb(0 0 0 / 0.8);
		white-space: nowrap;
	}
</style>
