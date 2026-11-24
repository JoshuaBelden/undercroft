<script lang="ts">
	/** The audio manager's graph: category buses, the world chain (muffler, reverb), master, output. */
	interface Box {
		x: number;
		y: number;
		label: string;
		note?: string;
		kind: 'bus-dry' | 'bus-world' | 'node' | 'out';
	}
	const BW = 136;
	const BH = 46;
	const boxes: Record<string, Box> = {
		music: { x: 20, y: 30, label: 'music', note: 'dry bus', kind: 'bus-dry' },
		ambience: { x: 20, y: 140, label: 'ambience', note: 'world bus', kind: 'bus-world' },
		sfx: { x: 20, y: 222, label: 'sfx', note: 'world bus', kind: 'bus-world' },
		muffler: { x: 390, y: 150, label: 'muffler', note: 'low-pass, setMuffle', kind: 'node' },
		send: { x: 210, y: 300, label: 'reverb send', note: 'setReverb', kind: 'node' },
		convolver: { x: 390, y: 300, label: 'convolver', note: 'room impulse', kind: 'node' },
		master: { x: 560, y: 80, label: 'master', note: 'master volume', kind: 'node' },
		output: { x: 730, y: 80, label: 'output', note: 'mute in background', kind: 'out' },
		downmix: { x: 730, y: 180, label: 'downmix', note: 'mono option', kind: 'out' },
		speakers: { x: 730, y: 280, label: 'speakers', kind: 'out' }
	};
	const right = (b: Box) => [b.x + BW, b.y + BH / 2] as const;
	const left = (b: Box) => [b.x, b.y + BH / 2] as const;
	const top = (b: Box) => [b.x + BW / 2, b.y] as const;
	const bottom = (b: Box) => [b.x + BW / 2, b.y + BH] as const;
	const b = boxes;

	/** Elbow path: across to `mid`, then to the end. */
	function elbow(from: readonly [number, number], to: readonly [number, number], mid: number) {
		return `M${from[0]},${from[1]} H${mid} V${to[1]} H${to[0]}`;
	}
	const edges: { d: string; kind: 'dry' | 'world' | 'plain' }[] = [
		{ d: elbow(right(b.music), left(b.master), 300), kind: 'dry' },
		{ d: elbow(right(b.ambience), left(b.muffler), 300), kind: 'world' },
		{ d: elbow(right(b.sfx), left(b.muffler), 300), kind: 'world' },
		{
			d: `M${right(b.ambience)[0]},${right(b.ambience)[1] + 8} H190 V${top(b.send)[1] - 14} H${top(b.send)[0]} V${top(b.send)[1]}`,
			kind: 'world'
		},
		{
			d: `M${right(b.sfx)[0]},${right(b.sfx)[1] + 8} H180 V${top(b.send)[1] - 6} H${top(b.send)[0] - 10} V${top(b.send)[1]}`,
			kind: 'world'
		},
		{ d: `M${right(b.send)[0]},${right(b.send)[1]} H${left(b.convolver)[0]}`, kind: 'world' },
		{ d: `M${top(b.convolver)[0]},${top(b.convolver)[1]} V${bottom(b.muffler)[1]}`, kind: 'world' },
		{ d: elbow(right(b.muffler), left(b.master), 540), kind: 'plain' },
		{ d: `M${right(b.master)[0]},${right(b.master)[1]} H${left(b.output)[0]}`, kind: 'plain' },
		{ d: `M${bottom(b.output)[0]},${bottom(b.output)[1]} V${top(b.downmix)[1]}`, kind: 'plain' },
		{ d: `M${bottom(b.downmix)[0]},${bottom(b.downmix)[1]} V${top(b.speakers)[1]}`, kind: 'plain' }
	];
</script>

<figure>
	<svg viewBox="0 0 880 370" role="img" aria-labelledby="signal-chain-title">
		<title id="signal-chain-title">
			Dry buses go straight to master. World buses pass through the muffler and also send to the
			reverb, whose output joins the muffler. Master feeds the output stage, the mono downmix and
			the speakers.
		</title>
		<defs>
			{#each ['dry', 'world', 'plain'] as kind (kind)}
				<marker
					id="sc-{kind}"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="7"
					markerHeight="7"
					orient="auto"
				>
					<path d="M0,0 L10,5 L0,10 z" class="head-{kind}" />
				</marker>
			{/each}
		</defs>
		{#each edges as edge, i (i)}
			<path d={edge.d} class="edge {edge.kind}" marker-end="url(#sc-{edge.kind})" />
		{/each}
		{#each Object.values(boxes) as box (box.label)}
			<rect x={box.x} y={box.y} width={BW} height={BH} rx="8" class="box {box.kind}" />
			<text x={box.x + 12} y={box.y + (box.note ? 20 : 28)} class="label">{box.label}</text>
			{#if box.note}
				<text x={box.x + 12} y={box.y + 37} class="note">{box.note}</text>
			{/if}
		{/each}
	</svg>
	<figcaption>
		<span class="key dry"></span> dry: straight to master
		<span class="key world"></span> world: muffled, and sent to the reverb
	</figcaption>
</figure>

<style>
	figure {
		margin: 1.4rem 0;
		max-width: 56rem;
	}
	svg {
		width: 100%;
		height: auto;
	}
	figcaption {
		font-size: 0.85rem;
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.key {
		display: inline-block;
		width: 1.4rem;
		height: 3px;
		margin-left: 0.6rem;
	}
	.key.dry {
		background: var(--dry);
	}
	.key.world {
		background: var(--world);
	}
	.box {
		fill: var(--node);
		stroke: var(--rule);
		stroke-width: 1.5;
	}
	.box.bus-dry {
		stroke: var(--dry);
	}
	.box.bus-world {
		stroke: var(--world);
	}
	.box.out {
		fill: var(--panel);
	}
	.label {
		font-size: 14px;
		font-weight: 650;
		fill: var(--ink);
	}
	.note {
		font-size: 11.5px;
		fill: var(--muted);
	}
	.edge {
		fill: none;
		stroke-width: 1.8;
	}
	.edge.dry {
		stroke: var(--dry);
	}
	.edge.world {
		stroke: var(--world);
	}
	.edge.plain {
		stroke: var(--ink);
	}
	.head-dry {
		fill: var(--dry);
	}
	.head-world {
		fill: var(--world);
	}
	.head-plain {
		fill: var(--ink);
	}
</style>
