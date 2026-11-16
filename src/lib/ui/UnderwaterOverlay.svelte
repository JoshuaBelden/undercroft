<script lang="ts">
	/**
	 * Eyes under the water: a murky green tint that darkens toward the edges, a slight blur, and
	 * a slow wobble of light (off with reduce flashing, or the system's reduced motion). `amount`
	 * (0..1) fades it in and out with the fog (src/lib/game/Underwater.ts).
	 */
	let { amount, calm = false }: { amount: number; calm?: boolean } = $props();
</script>

<div class="underwater" class:calm style:opacity={amount} aria-hidden="true">
	<div class="shimmer"></div>
</div>

<style>
	.underwater {
		position: fixed;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(
			ellipse at 50% 45%,
			rgb(20 70 60 / 0.25) 0%,
			rgb(8 40 36 / 0.5) 55%,
			rgb(2 12 12 / 0.92) 100%
		);
		backdrop-filter: blur(1.5px) saturate(0.6);
	}

	.shimmer {
		position: absolute;
		inset: -10%;
		background:
			repeating-linear-gradient(115deg, rgb(120 200 180 / 0.05) 0 40px, transparent 40px 110px),
			repeating-linear-gradient(65deg, rgb(120 200 180 / 0.04) 0 30px, transparent 30px 90px);
		animation: drift 7s ease-in-out infinite alternate;
	}

	.calm .shimmer {
		animation: none;
	}

	@keyframes drift {
		from {
			transform: translate(-2%, -1%) scale(1.02);
		}
		to {
			transform: translate(2%, 1.5%) scale(1.05);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.shimmer {
			animation: none;
		}
	}
</style>
