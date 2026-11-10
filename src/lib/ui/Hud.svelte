<script lang="ts">
	interface Props {
		/** 0..1 */
		stamina: number;
		exhausted: boolean;
		/** 0..1 */
		battery: number;
		/** 0 off, 1 low, 2 bright */
		headlamp: number;
	}

	let { stamina, exhausted, battery, headlamp }: Props = $props();

	const LAMP_LABELS = ['Off', 'Low', 'Bright'];
	const bars = $derived(Math.ceil(battery * 4));
</script>

<div class="crosshair" aria-hidden="true"></div>

{#if stamina < 0.999}
	<div class="stamina" class:exhausted aria-label="Stamina">
		<div class="fill" style:width="{stamina * 100}%"></div>
	</div>
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

	.stamina.exhausted .fill {
		background: rgb(200 90 70 / 0.7);
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
