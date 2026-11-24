<script lang="ts">
	/** WICK's packages under a game: what the game supplies, what WICK provides, and the one-way rule. */
	const PACKAGES = [
		{ name: 'audio', ready: true },
		{ name: 'render', ready: false },
		{ name: 'input', ready: false },
		{ name: 'settings', ready: false },
		{ name: 'net', ready: false },
		{ name: 'membership', ready: false },
		{ name: 'tooling', ready: false }
	];
	const W = 92;
	const GAP = 12;
	const LEFT = 30;
</script>

<figure>
	<svg viewBox="0 0 760 300" role="img" aria-labelledby="package-map-title">
		<title id="package-map-title">
			A game sits above WICK's packages and supplies them its content; the packages never import the
			game.
		</title>
		<defs>
			<marker
				id="pm-arrow"
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				orient="auto"
			>
				<path d="M0,0 L10,5 L0,10 z" class="fill-ink" />
			</marker>
		</defs>

		<rect x="30" y="20" width="700" height="84" rx="10" class="game" />
		<text x="50" y="50" class="title">Your game</text>
		<text x="50" y="76" class="note">
			Content (sounds, actions, settings sections), game systems, UI, a small bootstrap
		</text>

		<line x1="250" y1="104" x2="250" y2="176" class="flow" marker-end="url(#pm-arrow)" />
		<text x="262" y="146" class="label">imports @wick/*, passes its content in</text>

		<line x1="560" y1="176" x2="560" y2="110" class="never" />
		<text x="572" y="146" class="label never-text">never imports the game</text>
		<line x1="550" y1="134" x2="570" y2="154" class="never" />
		<line x1="570" y1="134" x2="550" y2="154" class="never" />

		<rect x="20" y="176" width="720" height="104" rx="12" class="wick" />
		<text x="34" y="198" class="small">wick/packages</text>
		{#each PACKAGES as pkg, i (pkg.name)}
			<rect
				x={LEFT + i * (W + GAP)}
				y="210"
				width={W}
				height="52"
				rx="8"
				class={pkg.ready ? 'pkg' : 'pkg coming'}
			/>
			<text x={LEFT + i * (W + GAP) + W / 2} y="241" class="pkg-name" text-anchor="middle"
				>{pkg.name}</text
			>
		{/each}
	</svg>
	<figcaption>Solid: available. Dashed: planned.</figcaption>
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
	}
	.game {
		fill: var(--accent-soft);
		stroke: var(--accent);
	}
	.wick {
		fill: var(--panel);
		stroke: var(--rule);
	}
	.pkg {
		fill: var(--node);
		stroke: var(--accent);
		stroke-width: 1.5;
	}
	.pkg.coming {
		stroke: var(--muted);
		stroke-dasharray: 5 4;
		opacity: 0.75;
	}
	.title {
		font-weight: 700;
		font-size: 18px;
		fill: var(--ink);
	}
	.note,
	.label,
	.small {
		font-size: 13px;
		fill: var(--muted);
	}
	.pkg-name {
		font-size: 14px;
		font-weight: 600;
		fill: var(--ink);
	}
	.flow {
		stroke: var(--ink);
		stroke-width: 1.6;
	}
	.fill-ink {
		fill: var(--ink);
	}
	.never {
		stroke: var(--accent);
		stroke-width: 1.6;
		stroke-dasharray: 4 3;
	}
	.never-text {
		fill: var(--accent);
	}
</style>
