<script lang="ts">
	import type { FrameStats } from '#lib/game/Engine.ts';
	import { LIGHT_BUDGET } from '#lib/game/Engine.ts';

	let { stats, rtt }: { stats: FrameStats; rtt: number } = $props();
</script>

<div class="stats" aria-hidden="true">
	<div>{stats.fps} fps · {stats.frameMs.toFixed(1)} ms</div>
	<div>{stats.drawCalls} draws · {stats.triangles.toLocaleString()} tris</div>
	<div class:over={stats.lights > LIGHT_BUDGET}>lights {stats.lights}/{LIGHT_BUDGET}</div>
	<div>rtt {rtt.toFixed(0)} ms</div>
</div>

<style>
	.stats {
		position: fixed;
		top: 8px;
		left: 8px;
		padding: 6px 8px;
		font:
			12px/1.4 ui-monospace,
			monospace;
		color: #b5f5b5;
		background: rgb(0 0 0 / 0.65);
		pointer-events: none;
		z-index: 10;
	}

	.over {
		color: #ff7070;
	}
</style>
