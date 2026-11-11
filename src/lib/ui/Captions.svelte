<script lang="ts">
	import type { Caption, CaptionDirection } from '#lib/game/audio/captions.svelte.ts';
	import type { CaptionSize } from '#lib/settings/settings.svelte.ts';

	interface Props {
		captions: Caption[];
		size: CaptionSize;
	}

	let { captions, size }: Props = $props();

	const DIRECTIONS: Record<CaptionDirection, string> = {
		ahead: '↑',
		behind: '↓',
		left: '←',
		right: '→',
		above: 'above',
		below: 'below'
	};
</script>

<div class="captions {size}" role="log" aria-label="Sound captions">
	{#each captions as caption (caption.id)}
		<div class="caption">
			{#if caption.direction && caption.direction !== 'right'}
				<span class="direction">{DIRECTIONS[caption.direction]}</span>
			{/if}
			<span>[{caption.text}]</span>
			{#if caption.direction === 'right'}
				<span class="direction">{DIRECTIONS.right}</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.captions {
		position: fixed;
		left: 50%;
		bottom: 136px;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 15px;
		pointer-events: none;
		z-index: 4;
	}

	.captions.small {
		font-size: 12px;
	}

	.captions.large {
		font-size: 20px;
	}

	.caption {
		display: flex;
		gap: 0.6em;
		align-items: baseline;
		padding: 0.2em 0.7em;
		font-family: var(--font-ui);
		white-space: nowrap;
		color: #efe6d6;
		background: rgb(0 0 0 / 0.7);
	}

	.direction {
		color: var(--accent);
	}
</style>
