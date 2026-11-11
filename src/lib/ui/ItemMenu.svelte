<script lang="ts">
	import type { MenuEntry } from './itemBoard.svelte.ts';

	/**
	 * The alternate menu of an item slot (right-click, or the keyboard's menu key): a short list of
	 * what can be done with it. It closes on a choice, Escape, or a press anywhere else.
	 */
	interface Props {
		/** What the menu is for, read out. */
		title: string;
		entries: MenuEntry[];
		/** Where it was asked for, in window coordinates. */
		x: number;
		y: number;
		onchoose: (id: MenuEntry['id']) => void;
		onclose: () => void;
	}

	let { title, entries, x, y, onchoose, onclose }: Props = $props();

	let width = $state(0);
	let height = $state(0);

	// Kept inside the window.
	const left = $derived(Math.max(8, Math.min(x, window.innerWidth - width - 8)));
	const top = $derived(Math.max(8, Math.min(y, window.innerHeight - height - 8)));

	/** Focus goes into the menu, and back to where it was when the menu goes. */
	function focusFirst(menu: HTMLElement): () => void {
		const before = document.activeElement as HTMLElement | null;
		menu.querySelector('button')?.focus();
		return () => before?.focus();
	}

	function key(event: KeyboardEvent): void {
		// Not the game's keys while the menu is open.
		event.stopPropagation();
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll('button')];
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		const step = event.key === 'ArrowDown' ? 1 : -1;
		buttons[(at + step + buttons.length) % buttons.length]?.focus();
	}

	function outside(event: PointerEvent): void {
		if (!(event.target as HTMLElement).closest('.item-menu')) onclose();
	}
</script>

<svelte:window onpointerdown={outside} onblur={onclose} />

<div
	class="item-menu"
	role="menu"
	tabindex="-1"
	aria-label={title}
	style:left="{left}px"
	style:top="{top}px"
	bind:clientWidth={width}
	bind:clientHeight={height}
	onkeydown={key}
	{@attach focusFirst}
>
	{#each entries as entry (entry.id)}
		<button type="button" role="menuitem" onclick={() => onchoose(entry.id)}>
			<span>{entry.label}</span>
			{#if entry.note}<span class="note">{entry.note}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.item-menu {
		position: fixed;
		z-index: 45;
		min-width: 170px;
		display: grid;
		padding: 6px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--panel);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.6);
	}

	button {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		padding: 8px 12px;
		border: 0;
		border-radius: 8px;
		font-size: 0.9rem;
		text-align: left;
	}

	button:hover,
	button:focus-visible {
		outline: none;
		background: rgb(255 255 255 / 0.1);
	}

	.note {
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
</style>
