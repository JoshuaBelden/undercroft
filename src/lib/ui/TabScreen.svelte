<script lang="ts" generics="G extends string">
	import type { Snippet } from 'svelte';
	import { menu } from '#lib/game/input/menus.ts';

	/**
	 * A full-window screen whose top bar's tabs are its groups: the settings screen and the
	 * admin screen. The current group's fields scroll under its title.
	 *
	 * Fields are laid out with these classes (styled here for everything inside `.fields`):
	 * `setting` (one row: its pill, then a `hint` beside it), `pill` (`name` on the left, `value`
	 * on the right), `button.pill` for an action. SliderField and StepperField build the common
	 * ones.
	 */
	interface Props {
		/** What the screen is, for assistive technology ("Settings", "Admin"). */
		label: string;
		groups: readonly G[];
		group: G;
		onclose: () => void;
		/** Darken what is behind the screen (the game view). */
		dim?: boolean;
		/** Hide what is behind almost entirely: for reading (the help screen). */
		solid?: boolean;
		/** Extra buttons in the bar, before Back. */
		actions?: Snippet;
		/** Under the fields, right-aligned. */
		footer?: Snippet;
		children: Snippet;
	}

	let {
		label,
		groups,
		group = $bindable(),
		onclose,
		dim = false,
		solid = false,
		actions,
		footer,
		children
	}: Props = $props();

	/** The controller's LB/RB: the group before or after, round. */
	function step(by: -1 | 1): void {
		group = groups[(groups.indexOf(group) + by + groups.length) % groups.length] ?? group;
	}
</script>

<section
	class="screen"
	class:dim
	class:solid
	aria-label={label}
	{@attach menu({ back: onclose, tabs: step, key: `${label}/${group}` })}
>
	<header>
		<nav aria-label="{label} groups">
			{#each groups as name (name)}
				<button
					type="button"
					class:current={group === name}
					aria-current={group === name ? 'true' : undefined}
					onclick={() => (group = name)}
				>
					{name}
				</button>
			{/each}
		</nav>
		{@render actions?.()}
		<button type="button" class="back" onclick={onclose}>Back</button>
	</header>

	<div class="body">
		<div class="content">
			<h1>{group}</h1>

			<div class="fields" data-pad-scroll>
				{@render children()}
			</div>

			{#if footer}
				<div class="footer">{@render footer()}</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.screen {
		/* How wide every field's pill is. */
		--setting-width: 400px;
		position: fixed;
		inset: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
	}

	.screen.dim {
		background: rgb(0 0 0 / 0.6);
	}

	/* Solid under the bar; the bar itself keeps a hint of what is behind. */
	.screen.solid .body {
		background: rgb(10 9 8 / 0.88);
	}

	.screen.solid header {
		background: rgb(20 17 15 / 0.9);
		backdrop-filter: blur(6px);
	}

	/* The bar matches the dashboard's (src/routes/(hub)/+layout.svelte): it stands in for it. */
	header {
		display: flex;
		align-items: center;
		gap: 28px;
		padding: 0 24px;
		background: rgb(10 9 8 / 0.78);
	}

	nav {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 10px;
		padding: 12px 0;
	}

	nav button,
	header :global(.back) {
		padding: 6px 16px;
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	nav button:hover,
	nav button:focus-visible,
	header :global(.back:hover),
	header :global(.back:focus-visible) {
		background: rgb(255 255 255 / 0.1);
	}

	nav button.current {
		border-color: var(--text);
	}

	header :global(.back) {
		border-color: var(--border);
	}

	/* Everything under the bar shares what is left of the window; only the fields scroll. */
	/* Everything under the bar. */
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		width: min(900px, 100%);
		margin: 0;
		padding: 0 24px 24px;
	}

	h1 {
		margin: 28px 0 16px;
		font-size: 2rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.fields {
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 20px;
		background: rgb(10 9 8 / 0.1);
	}

	/* One field: its pill, then anything said about it. */
	.fields :global(.setting) {
		display: flex;
		align-items: center;
		gap: 8px 16px;
	}

	.fields :global(.hint) {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.fields :global(.pill) {
		position: relative;
		flex: none;
		width: var(--setting-width);
		max-width: 100%;
		min-height: 40px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 16px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 999px;
		/* More solid than the container it sits in. */
		background: rgb(10 9 8 / 0.4);
		font-family: var(--font-ui);
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.fields :global(.pill:hover),
	.fields :global(.pill:has(:focus-visible)) {
		border-color: var(--accent);
	}

	.fields :global(.name) {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.fields :global(.value) {
		position: relative;
		color: var(--text);
		font-variant-numeric: tabular-nums;
		text-transform: capitalize;
	}

	.fields :global(.pill input[type='text']),
	.fields :global(.pill select) {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		outline: none;
		background: transparent;
		color: var(--text);
		font-size: inherit;
		text-align: right;
	}

	.fields :global(button.pill) {
		cursor: pointer;
	}

	.fields :global(kbd),
	.fields :global(code) {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: none;
	}

	.footer {
		margin-top: 16px;
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 720px) {
		header {
			flex-wrap: wrap;
			gap: 0 20px;
			padding: 10px 16px 0;
		}

		nav {
			order: 3;
			flex-basis: 100%;
			overflow-x: auto;
		}

		header :global(.back) {
			margin-left: auto;
		}

		/* No room beside the pill: what is said about a field goes under it. */
		.fields :global(.setting) {
			flex-wrap: wrap;
		}
	}
</style>
