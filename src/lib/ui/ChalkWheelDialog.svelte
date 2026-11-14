<script lang="ts">
	import { untrack } from 'svelte';
	import { DEFAULT_MARK_WHEEL, MARK_SYMBOLS } from '#lib/content/marks.ts';
	import Dialog from './Dialog.svelte';
	import MarkGlyph from './MarkGlyph.svelte';

	/**
	 * Choosing the chalk symbols on your wheel, from the Loadout page. Pick a place on the wheel,
	 * then a symbol for it; a symbol already elsewhere on the wheel swaps places. Nothing is kept
	 * until Save. See docs/dev/marks.md.
	 */
	interface Props {
		/** The wheel as saved: eight ids, top first and clockwise. */
		wheel: readonly string[];
		/** Underground or ready to descend: it can be looked at, not changed. */
		locked?: boolean;
		onsave: (wheel: string[]) => void;
		onclose: () => void;
	}

	let { wheel, locked = false, onsave, onclose }: Props = $props();

	/** The wheel being changed: what was saved when the dialog opened, until Save. */
	let draft = $state(untrack(() => [...wheel]));
	let place = $state(0);

	/** Distance of the places from the centre of the wheel (pixels). */
	const RADIUS = 104;

	const places = $derived(
		draft.map((id, index) => {
			const angle = (index / draft.length) * Math.PI * 2;
			return { id, index, x: Math.sin(angle) * RADIUS, y: -Math.cos(angle) * RADIUS };
		})
	);
	const changed = $derived(draft.some((id, i) => id !== wheel[i]));
	const isDefault = $derived(draft.every((id, i) => id === DEFAULT_MARK_WHEEL[i]));

	/** Put `symbol` in the chosen place; if it was elsewhere on the wheel, the two swap. */
	function choose(symbol: string): void {
		if (locked) return;
		const from = draft.indexOf(symbol);
		if (from >= 0) draft[from] = draft[place];
		draft[place] = symbol;
		place = (place + 1) % draft.length;
	}
</script>

<Dialog title="Chalk wheel" wide {onclose}>
	<p class="hint">
		{locked
			? "You can't change your wheel now: you're underground, or ready to descend."
			: 'Pick a place on the wheel, then the symbol to go there. The top is where the wheel starts.'}
	</p>
	<div class="layout">
		<div class="wheel" role="group" aria-label="Your wheel">
			{#each places as spot (spot.index)}
				<button
					type="button"
					class="place"
					class:current={spot.index === place && !locked}
					style:translate="{spot.x}px {spot.y}px"
					aria-label="Place {spot.index + 1}: {MARK_SYMBOLS[spot.id]?.name ?? spot.id}"
					aria-pressed={spot.index === place}
					disabled={locked}
					onclick={() => (place = spot.index)}
				>
					<MarkGlyph symbol={spot.id} />
				</button>
			{/each}
			<p class="name">{MARK_SYMBOLS[draft[place]]?.name ?? ''}</p>
		</div>
		<div class="catalogue" role="group" aria-label="Symbols">
			{#each Object.values(MARK_SYMBOLS) as symbol (symbol.id)}
				<button
					type="button"
					class="symbol"
					class:on={draft.includes(symbol.id)}
					disabled={locked}
					title={symbol.name}
					onclick={() => choose(symbol.id)}
				>
					<span class="glyph"><MarkGlyph symbol={symbol.id} /></span>
					<span class="label">{symbol.name}</span>
				</button>
			{/each}
		</div>
	</div>
	{#snippet footer()}
		<button
			type="button"
			disabled={locked || isDefault}
			onclick={() => (draft = [...DEFAULT_MARK_WHEEL])}
		>
			Reset to default
		</button>
		<button type="button" onclick={onclose}>Cancel</button>
		<button
			type="button"
			class="primary"
			disabled={locked || !changed}
			onclick={() => onsave([...draft])}
		>
			Save
		</button>
	{/snippet}
</Dialog>

<style>
	.hint {
		margin: 0 0 16px;
		color: var(--muted);
	}

	.layout {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		justify-content: center;
		align-items: center;
	}

	.wheel {
		position: relative;
		flex: none;
		width: 270px;
		height: 270px;
		border-radius: 50%;
		background: radial-gradient(circle, rgb(0 0 0 / 0.15) 30%, rgb(0 0 0 / 0.5) 70%);
	}

	.place {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 56px;
		height: 56px;
		margin: -28px 0 0 -28px;
		padding: 11px;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: rgb(14 12 10 / 0.85);
		cursor: pointer;
	}

	.place.current {
		border-color: var(--text);
		background: rgb(0 129 157 / 0.45);
	}

	.name {
		position: absolute;
		inset: 50% 0 auto;
		margin: -0.6em 0 0;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-align: center;
		text-transform: uppercase;
	}

	.catalogue {
		flex: 1;
		min-width: 240px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
		gap: 8px;
	}

	.symbol {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 4px 6px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		cursor: pointer;
	}

	/* Already on the wheel. */
	.symbol.on {
		border-color: var(--accent);
	}

	.glyph {
		width: 30px;
		height: 30px;
	}

	.label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		line-height: 1.2;
		text-align: center;
		color: var(--muted);
	}

	button:disabled {
		cursor: default;
		opacity: 0.6;
	}
</style>
