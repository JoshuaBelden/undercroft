<script lang="ts">
	/**
	 * The reverb's computed impulse response, as WICK builds it: noise under exp(-2.4 t), quieter for
	 * the first 80 ms. Drawn from the same formula and generator, decimated for the page.
	 */
	const W = 760;
	const H = 250;
	const PAD = { left: 44, right: 20, top: 16, bottom: 40 };
	const SECONDS = 2.8;
	const SAMPLES = 700;
	const mid = PAD.top + (H - PAD.top - PAD.bottom) / 2;
	const half = (H - PAD.top - PAD.bottom) / 2;
	const x = (t: number) => PAD.left + (t / SECONDS) * (W - PAD.left - PAD.right);

	let seed = 12345;
	const rand = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return (seed / 4294967296) * 2 - 1;
	};
	const envelope = (t: number) => Math.exp(-t * 2.4) * (t < 0.08 ? 0.6 : 1);
	const bars: { x: number; y: number }[] = [];
	for (let i = 0; i < SAMPLES; i++) {
		const t = (i / SAMPLES) * SECONDS;
		bars.push({ x: x(t), y: rand() * envelope(t) * half });
	}
	const decay = (sign: number) => {
		const pts: string[] = [];
		for (let i = 0; i <= 120; i++) {
			const t = 0.08 + (i / 120) * (SECONDS - 0.08);
			pts.push(
				`${i ? 'L' : 'M'}${x(t).toFixed(1)},${(mid - sign * Math.exp(-t * 2.4) * half).toFixed(1)}`
			);
		}
		return pts.join(' ');
	};
	const TICKS = [0, 0.5, 1, 1.5, 2, 2.5];
</script>

<figure>
	<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="ir-title">
		<title id="ir-title">
			The impulse response: random samples inside an exponentially decaying envelope, quieter for
			the first 80 milliseconds, fading by 60 dB over about 2.9 seconds.
		</title>
		<line x1={PAD.left} x2={W - PAD.right} y1={mid} y2={mid} class="axis" />
		{#each bars as bar, i (i)}
			<line x1={bar.x} x2={bar.x} y1={mid} y2={mid - bar.y} class="sample" />
		{/each}
		<path d={decay(1)} class="envelope" />
		<path d={decay(-1)} class="envelope" />
		<rect
			x={x(0)}
			y={PAD.top}
			width={x(0.08) - x(0)}
			height={H - PAD.top - PAD.bottom}
			class="early"
		/>
		<text x={x(0.08) + 6} y={PAD.top + 14} class="note">first 80 ms at 0.6×</text>
		<text x={x(0.9)} y={PAD.top + 40} class="note">envelope e^(−2.4t)</text>
		{#each TICKS as t (t)}
			<text x={x(t)} y={H - PAD.bottom + 18} class="tick" text-anchor="middle">{t} s</text>
		{/each}
	</svg>
</figure>

<style>
	figure {
		margin: 1.4rem 0;
		max-width: 52rem;
	}
	svg {
		width: 100%;
		height: auto;
	}
	.axis {
		stroke: var(--rule);
	}
	.sample {
		stroke: var(--world);
		stroke-width: 1;
		opacity: 0.85;
	}
	.envelope {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
	}
	.early {
		fill: var(--accent-soft);
		opacity: 0.6;
	}
	.note {
		font-size: 12px;
		fill: var(--muted);
	}
	.tick {
		font-size: 11.5px;
		fill: var(--muted);
	}
</style>
