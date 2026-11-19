<script lang="ts" module>
	/** The in-game menu's tabs, in order. */
	export const MENU_TABS = ['Pack', 'Map', 'Rite'] as const;
	export type MenuTab = (typeof MENU_TABS)[number];
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { InputMap } from '#lib/game/input/InputMap.ts';
	import { menu } from '#lib/game/input/menus.ts';
	import type { RiteSnapshot } from '#lib/shared/affliction/types.ts';
	import type { InventoryAction, MarkSnapshot } from '#lib/shared/items/types.ts';
	import { carriesSurvey, type SurveyMap } from '#lib/shared/map/survey.ts';
	import type { Inventory, SurveyHold } from '#lib/shared/player/types.ts';
	import ButtonHint from './ButtonHint.svelte';
	import Dialog from './Dialog.svelte';
	import MapPane from './MapPane.svelte';
	import MapTools from './MapTools.svelte';
	import type { SketchContent } from './mapSketch.ts';
	import { MapView } from './mapView.svelte.ts';
	import PackPanel from './PackPanel.svelte';
	import RitePanel from './RitePanel.svelte';

	/** What the Map tab draws and is told (docs/dev/map.md). */
	interface MenuMap {
		map: SurveyMap;
		drawn: ReadonlySet<string>;
		self: SketchContent['self'];
		marks: readonly MarkSnapshot[];
		input: InputMap;
		sketch: number;
		share: number;
		partner: string | null;
		onhold: (hold: SurveyHold) => void;
	}

	/**
	 * The in-game menu underground, opened by the `inventory` action on the Pack tab, or by `map` on
	 * the Map tab: Pack (PackPanel), Map (MapPane, with a notebook in the pack) and Rite (RitePanel,
	 * and Abandon expedition). The tabs are pills down the left of the header, switched by clicking
	 * them or with LB/RB; the Map tab's own buttons go in the middle (MapTools), and Close is at the
	 * bottom right. Nothing pauses while it is open. The Pack and Rite tabs share one place, so the
	 * menu keeps its size from one to the other; the map is as big as the window allows, and is only
	 * there while its tab shows. See docs/dev/items.md#the-in-game-menu.
	 */
	interface Props {
		/** The tab showing. */
		tab: MenuTab;
		inventory: Inventory;
		/** The Affliction this rite resolves, e.g. "The Gloaming". */
		affliction: string;
		/** The rite as known so far; null for no Rite tab. */
		rite: RiteSnapshot | null;
		/** For each requirement, who in the party carries it and how many (RitePanel). */
		carriers: { name: string; count: number; self: boolean }[][];
		/** The interact binding (RitePanel). */
		interactKey: string;
		onaction: (action: InventoryAction) => void;
		/** Abandon the expedition (asked to confirm first). */
		onabandon: () => void;
		/** The map, for the Map tab (shown only while a notebook is in the pack); null for none. */
		survey: MenuMap | null;
		onclose: () => void;
	}

	let {
		tab = $bindable(),
		inventory,
		affliction,
		rite,
		carriers,
		interactKey,
		onaction,
		onabandon,
		survey,
		onclose
	}: Props = $props();

	const mapping = $derived(!!survey && carriesSurvey(inventory));

	const tabs = $derived(
		MENU_TABS.filter((name) => name === 'Pack' || (name === 'Map' ? mapping : !!rite))
	);
	const current = $derived(tabs.includes(tab) ? tab : (tabs[0] ?? tab));
	/** Asking whether to really abandon the expedition. */
	let confirmingAbandon = $state(false);
	let panes = $state<HTMLElement>();

	function select(name: MenuTab): void {
		tab = name;
		// What had the focus is on the tab put away: the controller starts again on this one.
		const active = document.activeElement;
		if (active instanceof HTMLElement && panes?.contains(active)) active.blur();
	}

	/** Where the map page looks: made fresh each time the Map tab opens, so it opens on you. */
	let view = $state<MapView | null>(null);
	$effect(() => {
		const open = current === 'Map' && !!survey;
		untrack(() => {
			if (!open) view = null;
			else
				view ??= new MapView(
					() => survey!.map,
					() => survey!.self
				);
		});
	});

	/** The controller's LB/RB: the tab before or after, round. */
	function step(by: -1 | 1): void {
		const next = tabs[(tabs.indexOf(current) + by + tabs.length) % tabs.length];
		if (next) select(next);
	}
</script>

<div class="backdrop">
	<section
		class="panel"
		aria-label="Menu"
		{@attach menu({
			back: onclose,
			tabs: tabs.length > 1 ? step : undefined,
			holding: current === 'Map' ? (button, down) => view?.holding(button, down) : undefined,
			key: `menu/${current}`
		})}
	>
		<header>
			<nav aria-label="Menu tabs">
				{#if tabs.length > 1}<ButtonHint code="PadLB" />{/if}
				{#each tabs as name (name)}
					<button
						type="button"
						class:current={current === name}
						aria-current={current === name ? 'true' : undefined}
						onclick={() => select(name)}
					>
						{name}
					</button>
				{/each}
				{#if tabs.length > 1}<ButtonHint code="PadRB" />{/if}
			</nav>
			<div class="tools">
				{#if current === 'Map' && view}<MapTools {view} />{/if}
			</div>
		</header>

		<div class="panes" bind:this={panes}>
			<div class="pane" aria-label="Pack" inert={current !== 'Pack'}>
				<PackPanel {inventory} {onaction} />
			</div>
			{#if current === 'Map' && survey && view}
				<div class="pane" aria-label="Map">
					<MapPane {view} {...survey} />
				</div>
			{/if}
			{#if rite}
				<div class="pane rite" aria-label="Rite" inert={current !== 'Rite'}>
					<RitePanel {affliction} {rite} {carriers} {interactKey} />
					<button type="button" class="abandon" onclick={() => (confirmingAbandon = true)}>
						Abandon expedition
					</button>
				</div>
			{/if}
		</div>
		<footer>
			<button type="button" class="pill" onclick={onclose}>Close</button>
		</footer>
	</section>
</div>

{#if confirmingAbandon}
	<Dialog title="Abandon the expedition" onclose={() => (confirmingAbandon = false)}>
		<p>You go back to the surface now, alone. Anyone with you stays down there.</p>
		<p>Everything you carry is left where you stand, as if you had died.</p>
		{#snippet footer()}
			<button type="button" onclick={() => (confirmingAbandon = false)}>Stay</button>
			<button
				type="button"
				class="primary"
				onclick={() => {
					confirmingAbandon = false;
					onabandon();
				}}
			>
				Abandon
			</button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgb(0 0 0 / 0.5);
		z-index: 20;
	}

	.panel {
		max-width: 100%;
		max-height: calc(100vh - 32px);
		overflow-y: auto;
		padding: 18px 20px 20px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgb(14 12 10 / 0.82);
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	header {
		display: flex;
		align-items: center;
		gap: 20px;
		margin-bottom: 14px;
	}

	/* The Map tab's own buttons, in the middle of the header. */
	.tools {
		display: flex;
		flex: 1;
		justify-content: center;
		margin-right: auto;
	}

	footer {
		display: flex;
		justify-content: flex-end;
		margin-top: 14px;
	}

	.pill {
		padding: 6px 16px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: none;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.pill:hover,
	.pill:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	/* The tabs, as the dashboard's and the settings' (TabScreen). */
	nav {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	nav button {
		padding: 6px 16px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: none;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	nav button:hover,
	nav button:focus-visible {
		background: rgb(255 255 255 / 0.1);
	}

	nav button.current {
		border-color: var(--text);
	}

	/* Every tab in the same place: the menu is as big as the biggest, whichever is showing. */
	.panes {
		display: grid;
	}

	.pane {
		grid-area: 1 / 1;
		min-width: 0;
	}

	.pane[inert] {
		visibility: hidden;
	}

	.rite {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 20px;
	}

	.abandon {
		padding: 6px 16px;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: #ff9a70;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
	}
</style>
