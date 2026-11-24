<script lang="ts">
	/** What happens on `sounds.play(id)`: registry, files, load once, pick a variant, play; and the caption. */
	const STEPS = [
		{ label: 'play(id)', note: 'the game asks by id' },
		{ label: 'SoundDef', note: 'file, category, volume' },
		{ label: 'files', note: 'file id → variant URLs' },
		{ label: 'load + decode', note: 'once per sound, cached' },
		{ label: 'pick variant', note: 'random, rate varied' },
		{ label: 'category bus', note: 'AudioManager' }
	];
	const W = 122;
	const GAP = 22;
</script>

<figure>
	<svg viewBox="0 0 870 190" role="img" aria-labelledby="play-flow-title">
		<title id="play-flow-title">
			Playing a sound by id: its definition names its files and category; the files are loaded once,
			a variant is picked and played on the category bus. A captioned sound also raises a caption
			cue, even with audio locked.
		</title>
		<defs>
			<marker
				id="pf-arrow"
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				orient="auto"
			>
				<path d="M0,0 L10,5 L0,10 z" class="head" />
			</marker>
		</defs>
		{#each STEPS as step, i (step.label)}
			{@const x = 10 + i * (W + GAP)}
			<rect {x} y="20" width={W} height="58" rx="8" class="box" class:ends={i === 0 || i === 5} />
			<text x={x + 10} y="44" class="label">{step.label}</text>
			<text x={x + 10} y="63" class="note">{step.note}</text>
			{#if i < STEPS.length - 1}
				<line
					x1={x + W}
					y1="49"
					x2={x + W + GAP}
					y2="49"
					class="edge"
					marker-end="url(#pf-arrow)"
				/>
			{/if}
		{/each}
		<path d="M71,78 V140 H300" class="edge caption" marker-end="url(#pf-arrow)" />
		<rect x="300" y="118" width="250" height="46" rx="8" class="box caption-box" />
		<text x="312" y="138" class="label">oncaption(cue)</text>
		<text x="312" y="155" class="note">if it has a caption and is loud enough</text>
		<text x="600" y="140" class="note">No recording built? Nothing plays, no error.</text>
		<text x="600" y="157" class="note">A loop gets a silent handle.</text>
	</svg>
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
	.box {
		fill: var(--node);
		stroke: var(--rule);
		stroke-width: 1.5;
	}
	.box.ends {
		stroke: var(--accent);
	}
	.caption-box {
		fill: var(--panel);
	}
	.label {
		font-size: 13.5px;
		font-weight: 650;
		fill: var(--ink);
	}
	.note {
		font-size: 11.5px;
		fill: var(--muted);
	}
	.edge {
		stroke: var(--ink);
		stroke-width: 1.6;
		fill: none;
	}
	.edge.caption {
		stroke-dasharray: 4 3;
	}
	.head {
		fill: var(--ink);
	}
</style>
