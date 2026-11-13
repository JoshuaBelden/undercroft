<script lang="ts">
	import { settings } from '#lib/settings/settings.svelte.ts';
	import HoldPrompt from './HoldPrompt.svelte';
	import KeyCap from './KeyCap.svelte';
	import PartyHealth, { type PartyMember } from './PartyHealth.svelte';

	interface Props {
		/** 0..1 */
		battery: number;
		/** The headlamp's charge in volts (full is the lamp's `volts`, 0 is dead). */
		volts: number;
		/** 0 off, 1 low, 2 bright */
		headlamp: number;
		/** The key that switches the headlamp, as bound (e.g. "F"); empty when unbound. */
		lampKey: string;
		stance: string;
		creep: boolean;
		/** Context prompt, e.g. "Hold E to climb out"; null hides it. */
		prompt: string | null;
		/** A key shown as a keycap in the prompt, as bound; null for none. */
		promptKey: string | null;
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
		/** Everyone on the expedition (this player included): health and stamina, bottom-left. */
		party: PartyMember[];
	}

	let {
		battery,
		volts,
		headlamp,
		lampKey,
		stance,
		creep,
		prompt,
		promptKey,
		progress,
		sanity,
		hurt,
		hand,
		ammo,
		aiming,
		gloom,
		party
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
		<div class="hurt" class:gentle={settings.accessibility.reduceFlashing} aria-hidden="true"></div>
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

{#if prompt || promptKey}
	<div class="prompt">
		<HoldPrompt text={prompt ?? ''} key={promptKey} {progress} />
	</div>
{/if}

<PartyHealth members={party}>
	{#if posture}
		<div class="posture">{posture}</div>
	{/if}
	<div class="lamp" class:low={battery < 0.2} aria-label="Headlamp battery">
		{#if lampKey}<KeyCap label={lampKey} />{/if}
		<span class="cells">
			{#each [0, 1, 2, 3] as cell (cell)}
				<span class="cell" class:on={cell < bars}></span>
			{/each}
		</span>
		<!-- Rounded up: a lamp that still gives any light never reads 0 V. -->
		<span class="volts">{Math.ceil(volts)}V</span>
		<span>{LAMP_LABELS[headlamp] ?? ''}</span>
	</div>
</PartyHealth>

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

	/* "Reduce flashing": fainter, and fading in and out slowly rather than striking. */
	.hurt.gentle {
		animation: hurt-gentle 1.4s ease-in-out forwards;
	}

	@keyframes hurt-gentle {
		from {
			opacity: 0;
		}
		30% {
			opacity: 0.45;
		}
		to {
			opacity: 0;
		}
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

	.prompt {
		position: fixed;
		left: 50%;
		top: calc(50% + 40px);
		transform: translateX(-50%);
		pointer-events: none;
	}

	/* Under this player's bars in the party panel. */
	.posture {
		margin-top: 4px;
		font: 11px var(--font-ui);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		pointer-events: none;
	}

	.lamp {
		margin-top: 4px;
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

	.volts {
		margin-left: -4px;
		font-size: 9px;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
	}

	.lamp.low .volts {
		color: rgb(200 90 70 / 0.9);
	}
</style>
