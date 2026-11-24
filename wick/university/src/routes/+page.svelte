<script lang="ts">
	import { resolve } from '$app/paths';
	import { CHAPTERS } from '#university/chapters.ts';
</script>

<h1>WICK University</h1>
<p class="lede">
	<strong>WICK</strong>, the <strong>WebGL Integrated Creation Kit</strong>, is a set of TypeScript
	packages for building browser games: Three.js rendering and 3D models, input, audio, settings,
	multiplayer, membership and tooling.
</p>
<p>
	Each chapter covers one system in depth. It starts with the problem the system solves, then the
	browser technology underneath it and how that technology works, then how WICK builds on it and
	why. It ends with a step-by-step guide to using it in your own game and a full API reference. Most
	chapters include a live demo built on WICK alone. Start with
	<a href={resolve('/architecture')}>Architecture</a> for how the packages fit together.
</p>

<ul class="cards">
	{#each CHAPTERS as chapter (chapter.path)}
		<li class:coming={!chapter.ready}>
			{#if chapter.ready}
				<a href={resolve(chapter.path)}>{chapter.title}</a>
			{:else}
				<span>{chapter.title}</span><em>coming</em>
			{/if}
			<p>{chapter.summary}</p>
		</li>
	{/each}
</ul>

<style>
	.cards {
		list-style: none;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 1rem;
		margin-top: 2rem;
		max-width: 60rem;
	}
	.cards li {
		background: var(--panel);
		border: 1px solid var(--rule);
		border-radius: 10px;
		padding: 1rem 1.1rem;
	}
	.cards a,
	.cards span {
		font-weight: 700;
		font-size: 1.05rem;
	}
	.cards em {
		margin-left: 0.5rem;
		font-size: 0.75rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-style: normal;
	}
	.cards p {
		margin: 0.35rem 0 0;
		color: var(--muted);
		font-size: 0.92rem;
	}
	.coming {
		opacity: 0.7;
	}
</style>
