<script lang="ts">
	import type { Bearing, PingMark } from '#lib/game/play/bearings.svelte.ts';

	/**
	 * A worn pocket compass's needle at the top of the screen, and the party's whistles marked
	 * where they were blown (docs/dev/items.md#bearings).
	 */
	let { bearing, pings }: { bearing: Bearing | null; pings: PingMark[] } = $props();
</script>

{#if bearing}
	<div class="compass" aria-label="Compass">
		<div class="needle" style:transform="rotate({-bearing.angle}rad)"></div>
		<span class="to">{bearing.to === 'rite' ? 'The rite' : 'Way out'}</span>
		<span class="far">{Math.round(bearing.distance)} m</span>
	</div>
{/if}

{#each pings as ping, i (i)}
	<div
		class="ping"
		class:edge={ping.edge}
		class:mine={ping.mine}
		style:left="{ping.x}px"
		style:top="{ping.y}px"
		style:opacity={ping.fade}
		aria-hidden="true"
	></div>
{/each}

<style>
	.compass {
		position: fixed;
		top: 18px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px 4px 4px;
		border-radius: 999px;
		background: rgba(16, 14, 12, 0.6);
		border: 1px solid rgba(201, 176, 120, 0.4);
		color: #e6dccb;
		font-size: 0.8rem;
		pointer-events: none;
	}

	.needle {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 1px solid rgba(201, 176, 120, 0.6);
		background: conic-gradient(from -12deg, #b8402e 0 24deg, transparent 24deg 360deg);
	}

	.far {
		opacity: 0.7;
	}

	.ping {
		position: fixed;
		z-index: 40;
		width: 14px;
		height: 14px;
		margin: -7px 0 0 -7px;
		border-radius: 50%;
		border: 2px solid #e6dccb;
		box-shadow: 0 0 8px rgba(230, 220, 203, 0.6);
		pointer-events: none;
	}

	.ping.mine {
		border-color: rgba(230, 220, 203, 0.5);
	}

	.ping.edge {
		border-radius: 3px;
		transform: rotate(45deg);
	}
</style>
