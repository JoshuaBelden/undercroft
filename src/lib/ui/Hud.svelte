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
		/** 0..1 */
		sanity: number;
		/** Changes each time the player is hit (restarts the flash). */
		hurt: number;
		/** What is in the hand, and how many of it; null for empty hands (or the setting is off). */
		hand: { name: string; count: number } | null;
		/** Held firearm's rounds: loaded and spare (in the backpack); null when not holding one. */
		ammo: { loaded: number; spare: number } | null;
		aiming: boolean;
		/** 0..1 lamp failure from the Affliction: the edges close in. */
		gloom: number;
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
		progress,
		sanity,
		hurt,
		hand,
		ammo,
		aiming,
		gloom
	}: Props = $props();

	const LAMP_LABELS = ['Off', 'Low', 'Bright'];
	const bars = $derived(Math.ceil(battery * 4));
	const STANCE_LABELS: Record<string, string> = { crouch: 'Crouching', crawl: 'Crawling' };
	// The edges darken as sanity falls, and pulse with the heartbeat when it's low.
	const vignette = $derived(Math.min(0.92, Math.max(0, (1 - sanity) * 1.15, gloom * 0.75)));
	const posture = $derived(
		[STANCE_LABELS[stance], creep ? 'Creeping' : null].filter(Boolean).join(' · ')
	);
</script>

<div class="vignette" class:pulse={sanity < 0.4} style:opacity={vignette} aria-hidden="true"></div>

{#if hurt > 0}
	{#key hurt}
		<div class="hurt" aria-hidden="true"></div>
	{/key}
{/if}

<div class="crosshair" class:aiming aria-hidden="true"></div>

{#if hand}
	<div class="hand" aria-label="In your hand">
		{hand.name}{#if hand.count > 1}<span class="count">×{hand.count}</span>{/if}
	</div>
{/if}

{#if ammo}
	<div class="ammo" class:dry={ammo.loaded === 0} aria-label="Ammunition">
		<span class="loaded">{ammo.loaded}</span>
		<span class="spare">| {ammo.spare}</span>
	</div>
{/if}

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

{#if sanity < 0.999}
	<div class="sanity" class:low={sanity < 0.4} aria-label="Sanity">
		<div class="fill" style:width="{sanity * 100}%"></div>
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
	.vignette {
		position: fixed;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			transparent 35%,
			rgb(25 4 4 / 0.75) 75%,
			rgb(8 0 0 / 0.97) 100%
		);
		pointer-events: none;
		transition: opacity 0.6s ease-out;
	}

	.vignette.pulse {
		animation: pulse 0.85s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			filter: brightness(1);
		}
		18% {
			filter: brightness(0.55);
		}
	}

	.hurt {
		position: fixed;
		inset: 0;
		background: radial-gradient(ellipse at center, transparent 30%, rgb(120 10 10 / 0.55) 100%);
		pointer-events: none;
		animation: hurt 0.6s ease-out forwards;
	}

	@keyframes hurt {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vignette.pulse {
			animation: none;
		}
	}

	.sanity {
		position: fixed;
		left: 50%;
		bottom: 56px;
		width: 180px;
		height: 3px;
		margin-left: -90px;
		background: rgb(255 255 255 / 0.08);
		pointer-events: none;
	}

	.sanity .fill {
		height: 100%;
		background: rgb(190 170 200 / 0.65);
		transition: width 0.25s ease-out;
	}

	.sanity.low .fill {
		background: rgb(190 60 60 / 0.8);
	}

	/* What is in the hand, bottom-right under the ammunition. */
	.hand {
		position: fixed;
		right: 16px;
		bottom: 34px;
		display: flex;
		align-items: baseline;
		gap: 6px;
		font: 11px var(--font-ui);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #efe6d6;
		pointer-events: none;
	}

	.hand .count {
		color: var(--muted);
	}

	.ammo {
		position: fixed;
		right: 16px;
		bottom: 54px;
		display: flex;
		align-items: baseline;
		gap: 6px;
		font: 11px var(--font-ui);
		color: var(--muted);
		pointer-events: none;
	}

	.ammo .loaded {
		font-size: 20px;
		color: #efe6d6;
	}

	.ammo.dry .loaded {
		color: rgb(200 90 70 / 0.9);
	}

	.crosshair.aiming {
		width: 2px;
		height: 2px;
		margin: -1px 0 0 -1px;
		background: rgb(255 255 255 / 0.6);
	}

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
		font: 11px var(--font-ui);
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
		font: 11px var(--font-ui);
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
