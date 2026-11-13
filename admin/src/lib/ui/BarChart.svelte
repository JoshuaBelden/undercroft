<script lang="ts">
	/**
	 * Bars per day, for the dashboard: one or two series side by side, a tooltip on hover, and the
	 * numbers as a table under it. Colours were checked against the dark surface (accent and the
	 * launch gold: CVD and contrast pass).
	 */
	interface Series {
		key: string;
		label: string;
		color: string;
	}

	interface Props {
		title: string;
		rows: ({ day: string } & Record<string, number | string>)[];
		series: Series[];
	}

	let { title, rows, series }: Props = $props();

	const WIDTH = 640;
	const HEIGHT = 180;
	const PAD = { top: 10, right: 8, bottom: 22, left: 30 };
	const plotW = WIDTH - PAD.left - PAD.right;
	const plotH = HEIGHT - PAD.top - PAD.bottom;

	const value = (row: Props['rows'][number], key: string): number => Number(row[key] ?? 0);
	const max = $derived(Math.max(1, ...rows.flatMap((row) => series.map((s) => value(row, s.key)))));
	/** A round top for the axis: 1, 2, 5, 10, 20, 50... */
	const top = $derived.by(() => {
		const step = 10 ** Math.floor(Math.log10(max));
		return [1, 2, 5, 10].map((m) => m * step).find((n) => n >= max) ?? max;
	});
	const slot = $derived(rows.length ? plotW / rows.length : plotW);
	const barW = $derived(Math.max(2, Math.min(18, (slot - 6) / series.length - 2)));
	const y = (n: number): number => PAD.top + plotH - (n / top) * plotH;

	let hover = $state<number | null>(null);
	/** Label every few days so they don't collide. */
	const every = $derived(Math.max(1, Math.ceil(rows.length / 7)));

	/** A bar with a 4 px rounded top, square at the baseline. */
	function bar(x: number, h: number, w: number): string {
		const base = PAD.top + plotH;
		if (h <= 0) return '';
		const r = Math.min(4, w / 2, h);
		const t = base - h;
		return `M${x},${base}V${t + r}Q${x},${t} ${x + r},${t}H${x + w - r}Q${x + w},${t} ${x + w},${t + r}V${base}Z`;
	}
</script>

<figure>
	<figcaption>
		<span class="title">{title}</span>
		{#if series.length > 1}
			<span class="legend">
				{#each series as s (s.key)}
					<span><i style:background={s.color}></i>{s.label}</span>
				{/each}
			</span>
		{/if}
	</figcaption>

	{#if rows.length === 0}
		<p class="muted">No data yet.</p>
	{:else}
		<div class="plot">
			<svg viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label={title}>
				{#each [0, top / 2, top] as tick (tick)}
					<line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} class="grid" />
					<text x={PAD.left - 6} y={y(tick) + 4} text-anchor="end" class="axis">{tick}</text>
				{/each}
				{#each rows as row, i (row.day)}
					{@const x0 = PAD.left + i * slot + (slot - series.length * (barW + 2)) / 2}
					<g
						role="presentation"
						onmouseenter={() => (hover = i)}
						onmouseleave={() => (hover = null)}
					>
						<!-- The whole day's column is the hover target, not just the bars. -->
						<rect
							x={PAD.left + i * slot}
							y={PAD.top}
							width={slot}
							height={plotH}
							class="hit"
							class:on={hover === i}
						/>
						{#each series as s, j (s.key)}
							<path
								d={bar(x0 + j * (barW + 2), (value(row, s.key) / top) * plotH, barW)}
								fill={s.color}
							/>
						{/each}
						{#if i % every === 0}
							<text
								x={PAD.left + i * slot + slot / 2}
								y={HEIGHT - 6}
								text-anchor="middle"
								class="axis">{row.day.slice(5)}</text
							>
						{/if}
					</g>
				{/each}
			</svg>
			{#if hover !== null && rows[hover]}
				<div
					class="tip"
					style:left="{((PAD.left + (hover + 0.5) * slot) / WIDTH) * 100}%"
					role="status"
				>
					<strong>{rows[hover].day}</strong>
					{#each series as s (s.key)}
						<span><i style:background={s.color}></i>{s.label}: {value(rows[hover], s.key)}</span>
					{/each}
				</div>
			{/if}
		</div>
		<details>
			<summary>Table</summary>
			<table>
				<thead>
					<tr>
						<th>Day</th>
						{#each series as s (s.key)}<th>{s.label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.day)}
						<tr>
							<td>{row.day}</td>
							{#each series as s (s.key)}<td>{value(row, s.key)}</td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	{/if}
</figure>

<style>
	figure {
		margin: 0;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}

	.title {
		font-weight: 600;
	}

	.legend {
		display: flex;
		gap: 14px;
		color: var(--muted);
		font-size: 13px;
	}

	i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		margin-right: 6px;
	}

	.plot {
		position: relative;
	}

	svg {
		width: 100%;
		height: auto;
		display: block;
	}

	.grid {
		stroke: var(--border);
		stroke-width: 1;
	}

	.axis {
		fill: var(--muted);
		font-size: 11px;
		font-family: var(--font-ui);
	}

	.hit {
		fill: transparent;
	}

	.hit.on {
		fill: rgb(255 255 255 / 0.05);
	}

	.tip {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		display: grid;
		gap: 2px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		font-size: 13px;
		white-space: nowrap;
		pointer-events: none;
	}

	details {
		margin-top: 6px;
		font-size: 13px;
	}

	summary {
		cursor: pointer;
		color: var(--muted);
	}
</style>
