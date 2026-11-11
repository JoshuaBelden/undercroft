<script lang="ts">
	import { ITEMS } from '#lib/content/items.ts';
	import type { SlotRef } from '#lib/shared/items/types.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import type { ItemBoard } from './itemBoard.svelte.ts';
	import { stackDetail, stackLabel } from './items.ts';
	import Slot from './Slot.svelte';

	/**
	 * A slot things are dragged between: drag it onto another slot, shift-click it to send it where
	 * it belongs, right-click it (or the keyboard's menu key) for the alternate menu, and hover or
	 * focus it for the tooltip. All of it is reported to the screen's `ItemBoard`.
	 */
	interface Props {
		board: ItemBoard;
		/** Which slot this is. */
		ref: SlotRef;
		stack: ItemStack | null;
		size?: 'normal' | 'large';
		/** What the slot is for, shown while it is empty ("Primary"). */
		hint?: string;
		/** What the slot is called, read out ("Primary weapon", "Stash slot 3"). */
		label: string;
	}

	let { board, ref, stack, size = 'normal', hint, label }: Props = $props();

	const def = $derived(stack ? ITEMS[stack.item] : undefined);
	/** Something is being dragged: this slot would take it, or it wouldn't. */
	const target = $derived(board.dragging ? board.allows(ref) : null);

	function dragStart(event: DragEvent): void {
		if (!stack || board.locked) {
			event.preventDefault();
			return;
		}
		event.dataTransfer?.setData('text/plain', stack.item);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		board.startDrag(ref, stack);
	}

	/** Entering and moving over a slot that would take what is dragged: say it can be dropped here. */
	function dragOver(event: DragEvent): void {
		if (!board.allows(ref)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function dragEnter(event: DragEvent): void {
		board.hover(ref, true);
		dragOver(event);
	}

	/** Leaving the slot itself, not moving between the things inside it. */
	function dragLeave(event: DragEvent): void {
		const to = event.relatedTarget;
		if (!(to instanceof Node) || !(event.currentTarget as HTMLElement).contains(to)) {
			board.hover(ref, false);
		}
	}

	function drop(event: DragEvent): void {
		event.preventDefault();
		board.dropOn(ref);
	}

	function click(event: MouseEvent): void {
		if (stack && event.shiftKey) board.quick(ref);
	}

	function menu(event: MouseEvent): void {
		event.preventDefault();
		if (!stack) return;
		// From the keyboard there is no cursor: open it at the slot.
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const keyboard = event.clientX === 0 && event.clientY === 0;
		board.openMenu(
			ref,
			stack,
			keyboard ? rect.left + rect.width / 2 : event.clientX,
			keyboard ? rect.top + rect.height / 2 : event.clientY
		);
	}

	function point(event: Event): void {
		board.point(ref, event.currentTarget as HTMLElement);
	}
</script>

<button
	type="button"
	class="item-slot"
	class:filled={!!stack}
	class:accepts={target === true}
	class:refuses={target === false}
	class:over={board.isOver(ref)}
	draggable={stack && !board.locked ? 'true' : 'false'}
	aria-label={stack ? `${label}: ${stackLabel(stack)}` : `${label}: empty`}
	aria-haspopup={stack ? 'menu' : undefined}
	ondragstart={dragStart}
	ondragend={() => board.endDrag()}
	ondragenter={dragEnter}
	ondragleave={dragLeave}
	ondragover={dragOver}
	ondrop={drop}
	onclick={click}
	oncontextmenu={menu}
	onpointerenter={point}
	onpointerleave={() => board.unpoint()}
	onfocus={point}
	onblur={() => board.unpoint()}
>
	<Slot
		name={def?.name ?? stack?.item ?? ''}
		count={stack?.count ?? 1}
		{size}
		empty={!stack}
		{hint}
		image={def?.image}
		detail={stack ? stackDetail(stack) : undefined}
	/>
</button>

<style>
	.item-slot {
		display: flex;
		padding: 0;
		border: 0;
		border-radius: 12px;
		background: none;
		color: inherit;
		cursor: default;
	}

	.item-slot.filled {
		cursor: grab;
	}

	.item-slot.filled:hover :global(.slot),
	.item-slot:focus-visible :global(.slot) {
		border-color: var(--text);
		background: rgb(255 255 255 / 0.09);
	}

	.item-slot:focus-visible {
		outline: none;
	}

	/*
	 * While something is dragged: where it can go is marked in a dark blue, the slot it is over
	 * is lit, and where it can't go is dimmed.
	 */
	.item-slot.accepts :global(.slot) {
		border-color: #005a6e;
		background: rgb(0 70 86 / 0.28);
	}

	.item-slot.over :global(.slot) {
		border-color: var(--accent);
		background: rgb(0 129 157 / 0.2);
	}

	.item-slot.refuses {
		opacity: 0.4;
	}
</style>
