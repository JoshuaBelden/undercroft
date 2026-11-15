<script lang="ts" module>
	/** The in-game menu's tabs, in order. */
	export const MENU_TABS = ['Pack', 'Rite'] as const;
	export type MenuTab = (typeof MENU_TABS)[number];
</script>

<script lang="ts">
	import { menu } from '#lib/game/input/menus.ts';
	import type { RiteSnapshot } from '#lib/shared/affliction/types.ts';
	import type { InventoryAction } from '#lib/shared/items/types.ts';
	import type { Inventory } from '#lib/shared/player/types.ts';
	import ButtonHint from './ButtonHint.svelte';
	import Dialog from './Dialog.svelte';
	import PackPanel from './PackPanel.svelte';
	import RitePanel from './RitePanel.svelte';

	/**
	 * The in-game menu underground, opened by the `inventory` action: the Pack tab (PackPanel) and
	 * the Rite tab (RitePanel, and Abandon expedition). Tabs are switched by clicking them or with
	 * LB/RB. Nothing pauses while it is open. The tabs share one place, so the menu keeps its size
	 * from one to the other. See docs/dev/items.md#the-in-game-menu.
	 */
	interface Props {
		/** The tab showing. */
		tab: MenuTab;
		/** What you carry; null while the pack can't be used (down, or dead and watching): no Pack tab. */
		inventory: Inventory | null;
		/** The Affliction this rite resolves, e.g. "The Gloaming". */
		affliction: string;
		/** The rite as known so far; null for no Rite tab. */
		rite: RiteSnapshot | null;
		/** For each requirement, who in the party carries it and how many (RitePanel). */
		carriers: { name: string; count: number; self: boolean }[][];
		/** The interact binding (RitePanel). */
		interactKey: string;
		onaction: (action: InventoryAction) => void;
		/** Given, the Rite tab offers to abandon the expedition (asked to confirm first). */
		onabandon?: () => void;
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
		onclose
	}: Props = $props();

	const tabs = $derived(MENU_TABS.filter((name) => (name === 'Pack' ? !!inventory : !!rite)));
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
			<button type="button" onclick={onclose}>Close</button>
		</header>

		<div class="panes" bind:this={panes}>
			{#if inventory}
				<div class="pane" aria-label="Pack" inert={current !== 'Pack'}>
					<PackPanel {inventory} {onaction} />
				</div>
			{/if}
			{#if rite}
				<div class="pane rite" aria-label="Rite" inert={current !== 'Rite'}>
					<RitePanel {affliction} {rite} {carriers} {interactKey} />
					{#if onabandon}
						<button type="button" class="abandon" onclick={() => (confirmingAbandon = true)}>
							Abandon expedition
						</button>
					{/if}
				</div>
			{/if}
		</div>
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
					onabandon?.();
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
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		margin-bottom: 14px;
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
