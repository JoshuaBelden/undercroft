<script lang="ts">
	/**
	 * A second-order low-pass filter's magnitude response at three cutoffs, on a log frequency axis:
	 * |H(f)| = 1 / sqrt(1 + (f / fc)^4) (Butterworth), in dB.
	 */
	const W = 760;
	const H = 280;
	const PAD = { left: 54, right: 20, top: 18, bottom: 40 };
	const F_MIN = 20;
	const F_MAX = 20000;
	const DB_MIN = -40;

	const x = (f: number) =>
		PAD.left +
		((Math.log10(f) - Math.log10(F_MIN)) / (Math.log10(F_MAX) - Math.log10(F_MIN))) *
			(W - PAD.left - PAD.right);
	const y = (db: number) => PAD.top + (db / DB_MIN) * (H - PAD.top - PAD.bottom);

	function curve(fc: number): string {
		const points: string[] = [];
		for (let i = 0; i <= 200; i++) {
			const f = F_MIN * Math.pow(F_MAX / F_MIN, i / 200);
			const db = Math.max(DB_MIN, -10 * Math.log10(1 + Math.pow(f / fc, 4)));
			points.push(`${i ? 'L' : 'M'}${x(f).toFixed(1)},${y(db).toFixed(1)}`);
		}
		return points.join(' ');
	}

	const CUTOFFS = [
		{ fc: 20000, label: 'muffle 0 · 20 kHz', cls: 'open' },
		{ fc: 2188, label: 'muffle 0.6 · 2.2 kHz', cls: 'mid' },
		{ fc: 500, label: 'muffle 1 · 500 Hz', cls: 'shut' }
	];
	const TICKS = [20, 100, 500, 1000, 5000, 20000];
	const DBS = [0, -10, -20, -30, -40];
	const label = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);
</script>

<figure>
	<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="filter-title">
		<title id="filter-title">
			Low-pass frequency response at cutoffs of 20 kHz, 2.2 kHz and 500 Hz: flat below the cutoff,
			falling 12 dB per octave above it.
		</title>
		{#each DBS as db (db)}
			<line x1={PAD.left} x2={W - PAD.right} y1={y(db)} y2={y(db)} class="grid" />
			<text x={PAD.left - 8} y={y(db) + 4} class="tick" text-anchor="end">{db} dB</text>
		{/each}
		{#each TICKS as f (f)}
			<line x1={x(f)} x2={x(f)} y1={PAD.top} y2={H - PAD.bottom} class="grid" />
			<text x={x(f)} y={H - PAD.bottom + 18} class="tick" text-anchor="middle">{label(f)} Hz</text>
		{/each}
		<line x1={PAD.left} x2={W - PAD.right} y1={y(-3)} y2={y(-3)} class="half" />
		<text x={W - PAD.right - 4} y={y(-3) - 5} class="tick" text-anchor="end">−3 dB: the cutoff</text
		>
		{#each CUTOFFS as c (c.fc)}
			<path d={curve(c.fc)} class="curve {c.cls}" />
		{/each}
	</svg>
	<figcaption>
		{#each CUTOFFS as c (c.fc)}
			<span class="key {c.cls}"></span>{c.label}
		{/each}
	</figcaption>
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
	figcaption {
		font-size: 0.85rem;
		color: var(--muted);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.key {
		display: inline-block;
		width: 1.4rem;
		height: 3px;
		margin-left: 0.8rem;
	}
	.grid {
		stroke: var(--rule);
		stroke-width: 1;
	}
	.half {
		stroke: var(--muted);
		stroke-dasharray: 4 4;
	}
	.tick {
		font-size: 11.5px;
		fill: var(--muted);
	}
	.curve {
		fill: none;
		stroke-width: 2.4;
	}
	.open,
	.key.open {
		stroke: var(--muted);
		background: var(--muted);
	}
	.mid,
	.key.mid {
		stroke: var(--world);
		background: var(--world);
	}
	.shut,
	.key.shut {
		stroke: var(--accent);
		background: var(--accent);
	}
</style>
