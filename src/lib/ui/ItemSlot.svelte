<script lang="ts">
	import { ITEMS, rarityOf } from '#lib/content/items.ts';
	import type { PadButton } from '#lib/game/input/menus.ts';
	import type { SlotRef } from '#lib/shared/items/types.ts';
	import type { ItemStack } from '#lib/shared/player/types.ts';
	import type { ItemBoard } from './itemBoard.svelte.ts';
	import { slotMark, stackDetail, stackLabel } from './items.ts';
	import Slot from './Slot.svelte';

	/**
	 * A slot things are dragged between: drag it onto another slot, shift-click it to send it where
	 * it belongs, right-click it (or the keyboard's menu key) for the alternate menu, and hover or
	 * focus it for the tooltip. A controller carries with A, sends with X and opens the menu with Y.
	 * All of it is reported to the screen's `ItemBoard`.
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

	/** The controller: carrying moves with the focus, as dragging does with the cursor. */
	function pad(slot: HTMLElement): () => void {
		const press = (event: Event): void => {
			const button = (event as CustomEvent<PadButton>).detail;
			if (button === 'a') {
				board.carry(ref, stack);
				if (!board.dragging) board.point(ref, slot);
			} else if (button === 'b' && board.dragging) board.endDrag();
			else if (button === 'x' && stack && !board.dragging) board.quick(ref);
			else if (button === 'y' && stack && !board.dragging) {
				// At the slot, as from the keyboard.
				const rect = slot.getBoundingClientRect();
				board.openMenu(ref, stack, rect.left + rect.width / 2, rect.top + rect.height / 2);
			} else return;
			event.preventDefault();
		};
		const focus = (): void => board.hover(ref, true);
		const blur = (): void => board.hover(ref, false);
		slot.addEventListener('padpress', press);
		slot.addEventListener('focus', focus);
		slot.addEventListener('blur', blur);
		return () => {
			slot.removeEventListener('padpress', press);
			slot.removeEventListener('focus', focus);
			slot.removeEventListener('blur', blur);
		};
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
	{@attach pad}
>
	<Slot
		name={def?.name ?? stack?.item ?? ''}
		count={stack?.count ?? 1}
		{size}
		empty={!stack}
		{hint}
		image={def?.image}
		detail={stack ? stackDetail(stack) : undefined}
		rarity={stack ? rarityOf(stack.item) : undefined}
		quest={stack ? def?.quest : undefined}
		mark={stack ? slotMark(stack.item) : undefined}
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
		--slot-border: var(--text);
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
		--slot-border: #005a6e;
		background: rgb(0 70 86 / 0.28);
	}

	.item-slot.over :global(.slot) {
		--slot-border: var(--accent);
		background: rgb(0 129 157 / 0.2);
	}

	.item-slot.refuses {
		opacity: 0.4;
	}
</style>
