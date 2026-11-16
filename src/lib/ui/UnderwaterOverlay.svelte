<script lang="ts">
	/**
	 * Eyes under the water: the view turns a murky green, darker toward the edges. `amount` (0..1)
	 * fades it in and out with the fog (src/lib/game/Underwater.ts).
	 */
	let { amount }: { amount: number } = $props();
</script>

<div class="underwater" style:opacity={amount} aria-hidden="true"></div>

<style>
	.underwater {
		position: fixed;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(
			ellipse at 50% 45%,
			rgb(20 70 60 / 0.3) 0%,
			rgb(8 40 36 / 0.55) 55%,
			rgb(2 12 12 / 0.9) 100%
		);
	}
</style>
