<script lang="ts">
	import HoldPrompt from './HoldPrompt.svelte';

	interface Props {
		/** 0..1 */
		stamina: number;
		exhausted: boolean;
		/** 0..1 */
		battery: number;
		/** 0 off, 1 low, 2 bright */
		headlamp: number;
		/** Stamina is breath while underwater. */
		underwater: boolean;
		stance: string;
		creep: boolean;
		/** Context prompt, e.g. "Hold E to climb out"; null hides it. */
		prompt: string | null;
		/** 0..1 progress of a held action (extraction); 0 hides the bar. */
		progress: number;
	}

	let {
		stamina,
		exhausted,
		battery,
		headlamp,
		underwater,
		stance,
		creep,
		prompt,
		progress
	}: Props = $props();

	const LAMP_LABELS = ['Off', 'Low', 'Bright'];
	const bars = $derived(Math.ceil(battery * 4));
	const STANCE_LABELS: Record<string, string> = { crouch: 'Crouching', crawl: 'Crawling' };
	const posture = $derived(
		[STANCE_LABELS[stance], creep ? 'Creeping' : null].filter(Boolean).join(' · ')
	);
</script>

<div class="crosshair" aria-hidden="true"></div>

{#if prompt}
	<div class="prompt">
		<HoldPrompt text={prompt} {progress} />
	</div>
{/if}

{#if stamina < 0.999 || underwater}
	<div
		class="stamina"
		class:exhausted
		class:underwater
		aria-label={underwater ? 'Breath' : 'Stamina'}
	>
		<div class="fill" style:width="{stamina * 100}%"></div>
	</div>
{/if}

{#if posture}
	<div class="posture">{posture}</div>
{/if}

<div class="lamp" class:low={battery < 0.2} aria-label="Headlamp battery">
	<span class="cells">
		{#each [0, 1, 2, 3] as cell (cell)}
			<span class="cell" class:on={cell < bars}></span>
		{/each}
	</span>
	<span>{LAMP_LABELS[headlamp] ?? ''}</span>
</div>

<style>
	.crosshair {
		position: fixed;
		left: 50%;
		top: 50%;
		width: 3px;
		height: 3px;
		margin: -1.5px 0 0 -1.5px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.35);
		pointer-events: none;
	}

	.stamina {
		position: fixed;
		left: 50%;
		bottom: 48px;
		width: 180px;
		height: 3px;
		margin-left: -90px;
		background: rgb(255 255 255 / 0.08);
		pointer-events: none;
	}

	.stamina .fill {
		height: 100%;
		background: rgb(220 210 190 / 0.6);
	}

	.stamina.underwater .fill {
		background: rgb(120 170 210 / 0.75);
	}

	.stamina.exhausted .fill {
		background: rgb(200 90 70 / 0.7);
	}

	.prompt {
		position: fixed;
		left: 50%;
		top: calc(50% + 40px);
		transform: translateX(-50%);
		pointer-events: none;
	}

	.posture {
		position: fixed;
		left: 16px;
		bottom: 34px;
		font:
			11px ui-monospace,
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		pointer-events: none;
	}

	.lamp {
		position: fixed;
		left: 16px;
		bottom: 14px;
		display: flex;
		gap: 8px;
		align-items: center;
		font:
			11px ui-monospace,
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		pointer-events: none;
	}

	.cells {
		display: flex;
		gap: 2px;
	}

	.cell {
		width: 6px;
		height: 10px;
		border: 1px solid rgb(255 255 255 / 0.25);
	}

	.cell.on {
		background: rgb(230 220 190 / 0.6);
	}

	.lamp.low .cell.on {
		background: rgb(200 90 70 / 0.8);
	}
</style>
