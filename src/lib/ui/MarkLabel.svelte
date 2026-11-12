<script lang="ts">
	/**
	 * Who drew the chalk mark you are close to: a small name just under the mark, placed on the
	 * screen where the mark is. See docs/dev/marks.md.
	 */
	interface Props {
		/** The drawer's gamer tag, or "You". */
		name: string;
		/** The mark's place on the screen (pixels from the top-left). */
		x: number;
		y: number;
	}

	let { name, x, y }: Props = $props();
</script>

<p class="label" style:left="{x}px" style:top="{y}px">{name}</p>

<style>
	.label {
		position: fixed;
		z-index: 5;
		margin: 0;
		padding: 2px 8px;
		translate: -50% 0;
		pointer-events: none;
		white-space: nowrap;
		border-radius: 4px;
		background: rgb(14 12 10 / 0.6);
		font-family: var(--font-ui);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		color: var(--text);
		opacity: 0.85;
	}
</style>
