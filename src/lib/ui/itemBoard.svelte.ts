import { sellPrice } from '#lib/content/economy.ts';
import { ITEMS } from '#lib/content/items.ts';
import { repairCost } from '#lib/shared/items/crafting.ts';
import { accepts, canEquip, getSlot, type Belongings } from '#lib/shared/items/inventory.ts';
import type { InventoryAction, SlotRef } from '#lib/shared/items/types.ts';
import type { ItemStack } from '#lib/shared/player/types.ts';

/** One line of the alternate menu. */
export interface MenuEntry {
	id: 'read' | 'inspect' | 'equip' | 'unequip' | 'split' | 'sell' | 'repair' | 'drop';
	label: string;
	/** Shown to the right (the price). */
	note?: string;
	/** After the label, with the coin sign: "Sell ＄5", or "Sell ＄5 each" for a stack. */
	price?: { amount: number; after: string };
}

export interface BoardOptions {
	/** What the slots show: the inventory and, on the surface, the stash. */
	belongings: () => Belongings;
	/** Carry out a request (send it to whichever server owns these belongings). */
	act: (action: InventoryAction) => void;
	/** Sell from a slot. Leave out where nothing can be sold (underground). */
	sell?: (from: SlotRef, count: number) => void;
	/** Mend a worn thing (off to the Workshop with it). Leave out where nothing is mended. */
	repair?: (at: SlotRef) => void;
	/** Newly discovered: its slot shimmers until hovered (`seen` is told). */
	fresh?: (item: string) => boolean;
	seen?: (item: string) => void;
	/** Nothing can be changed right now (the explorer is underground, a request is in flight). */
	locked?: () => boolean;
	/** What a price reads as, e.g. "25 coin". */
	price?: (amount: number) => string;
	/**
	 * Dropping throws the thing away for good, so it is confirmed first (the surface). Without it
	 * a drop lands on the floor and just happens (underground).
	 */
	confirmDrop?: boolean;
}

/**
 * What a screen of item slots shares: what is being dragged, which slot the tooltip is for, the
 * alternate menu and the question being asked (how many, are you sure). `ItemSlot` reports to it,
 * `ItemOverlays` draws what it holds, and every change goes out through `act` as an
 * `InventoryAction`. One per screen. See docs/dev/systems.md.
 */
export class ItemBoard {
	/** The stack being dragged, and where from. */
	dragging = $state<{ ref: SlotRef; item: string } | null>(null);
	/** While dragging: the slot the dragged thing is over, if it would take it. */
	private over = $state<SlotRef | null>(null);
	/** The slot under the cursor (or focused), and where it is on the screen. */
	private pointing = $state<{ ref: SlotRef; rect: DOMRect } | null>(null);
	/** The open alternate menu: which slot, and where it was asked for. */
	menu = $state<{ ref: SlotRef; stack: ItemStack; x: number; y: number } | null>(null);
	/** The open dialog: how many to split or sell, or whether to really drop it. */
	asking = $state<{ kind: 'split' | 'sell' | 'drop'; ref: SlotRef; stack: ItemStack } | null>(null);
	/** The slot whose Inspect panel is open. */
	private inspecting = $state<{ ref: SlotRef; stack: ItemStack } | null>(null);

	constructor(private options: BoardOptions) {}

	/**
	 * What the tooltip is for: the stack in the slot under the cursor, as it is now. Nothing once
	 * the slot is empty (its stack was moved away while the cursor stayed).
	 */
	get pointed(): { stack: ItemStack; rect: DOMRect } | null {
		const pointing = this.pointing;
		const stack = pointing ? getSlot(this.options.belongings(), pointing.ref) : null;
		return pointing && stack ? { stack, rect: pointing.rect } : null;
	}

	/**
	 * The stack the Inspect panel is for, as it is now: what is in that slot if it is still the same
	 * item (its wear and rounds can change underground), else what it was when it was opened.
	 */
	get inspected(): ItemStack | null {
		const inspecting = this.inspecting;
		if (!inspecting) return null;
		const now = getSlot(this.options.belongings(), inspecting.ref);
		return now?.item === inspecting.stack.item ? now : inspecting.stack;
	}

	/** Put the Inspect panel away. */
	closeInspect(): void {
		this.inspecting = null;
	}

	get locked(): boolean {
		return this.options.locked?.() ?? false;
	}

	/** "25 coin" for a price, as this screen writes money. */
	price(amount: number): string {
		return this.options.price?.(amount) ?? String(amount);
	}

	startDrag(ref: SlotRef, stack: ItemStack): void {
		this.dragging = { ref, item: stack.item };
		this.pointing = null;
		this.menu = null;
	}

	endDrag(): void {
		this.dragging = null;
		this.over = null;
	}

	/**
	 * A mouse button came up anywhere. While a drag is really going on the browser sends no
	 * mouseup (it ends with a drop and dragend), so one arriving means the drag died without its
	 * dragend (an interrupted drag in Firefox): stop showing it, or the slots stay lit.
	 */
	released(): void {
		if (this.dragging) this.endDrag();
	}

	/** The dragged thing came over a slot (`true`) or left it. */
	hover(ref: SlotRef, over: boolean): void {
		if (over) this.over = this.allows(ref) ? ref : null;
		else if (this.over && same(this.over, ref)) this.over = null;
	}

	/** Whether the dragged thing is over this slot, and could be dropped on it. */
	isOver(ref: SlotRef): boolean {
		return !!this.over && same(this.over, ref);
	}

	/** Whether what is being dragged may be dropped on this slot. */
	allows(ref: SlotRef): boolean {
		const dragging = this.dragging;
		if (!dragging || this.locked || same(dragging.ref, ref)) return false;
		if (!accepts(ref, dragging.item)) return false;
		// Swapping: what is there has to be allowed where the dragged thing came from.
		const there = getSlot(this.options.belongings(), ref);
		return !there || there.item === dragging.item || accepts(dragging.ref, there.item);
	}

	dropOn(ref: SlotRef): void {
		const dragging = this.dragging;
		this.dragging = null;
		this.over = null;
		if (dragging && !same(dragging.ref, ref) && !this.locked) {
			this.options.act({ kind: 'move', from: dragging.ref, to: ref });
		}
	}

	/**
	 * The controller's A on a slot (docs/dev/controller.md): pick up what is there, or put down
	 * what is carried, on a slot that takes it or back where it came from. Carrying is dragging.
	 */
	carry(ref: SlotRef, stack: ItemStack | null): void {
		const dragging = this.dragging;
		if (!dragging) {
			if (stack && !this.locked) this.startDrag(ref, stack);
		} else if (same(dragging.ref, ref)) this.endDrag();
		else if (this.allows(ref)) this.dropOn(ref);
	}

	/** Shift-click: straight to where it belongs on the other side. */
	quick(ref: SlotRef): void {
		if (!this.locked) this.options.act({ kind: 'quick', from: ref });
	}

	point(ref: SlotRef, element: HTMLElement): void {
		if (!this.dragging && !this.menu) {
			this.pointing = { ref, rect: element.getBoundingClientRect() };
		}
		// Looked at: a fresh discovery stops shimmering.
		const stack = getSlot(this.options.belongings(), ref);
		if (stack && this.options.fresh?.(stack.item)) this.options.seen?.(stack.item);
	}

	/** Whether a stack's slot shimmers: newly discovered and not looked at yet. */
	isFresh(stack: ItemStack | null): boolean {
		return !!stack && !!this.options.fresh?.(stack.item);
	}

	unpoint(): void {
		this.pointing = null;
	}

	/** Locked, the menu still opens: Inspect changes nothing, so it is all it offers then. */
	openMenu(ref: SlotRef, stack: ItemStack, x: number, y: number): void {
		this.pointing = null;
		this.menu = { ref, stack, x, y };
	}

	closeMenu(): void {
		this.menu = null;
	}

	/** What the menu offers for a slot: only what can be done with it. */
	entries(ref: SlotRef, stack: ItemStack): MenuEntry[] {
		// A hint (in a crate) can only be read where it lies.
		if (ITEMS[stack.item]?.kind === 'clue') return [{ id: 'read', label: 'Read' }];
		const entries: MenuEntry[] = [{ id: 'inspect', label: 'Inspect' }];
		if (this.locked) return entries;
		const worn = ref.area === 'equipment' || ref.area === 'quick';
		if (worn) entries.push({ id: 'unequip', label: 'Unequip' });
		else if (canEquip(this.options.belongings(), ref)) {
			entries.push({ id: 'equip', label: 'Equip' });
		}
		if (stack.count > 1 && ref.area !== 'equipment') entries.push({ id: 'split', label: 'Split' });
		const each = this.options.sell ? sellPrice(stack.item, stack) : 0;
		// The price of one; a stack asks how many next.
		if (each > 0) {
			entries.push({
				id: 'sell',
				label: 'Sell',
				price: { amount: each, after: stack.count > 1 ? ' each' : '' }
			});
		}
		// Below full, and something that can be mended: off to the Workshop with it.
		if (this.options.repair && repairCost(stack)) entries.push({ id: 'repair', label: 'Repair' });
		entries.push({ id: 'drop', label: 'Drop' });
		return entries;
	}

	/** A menu entry was chosen. */
	choose(id: MenuEntry['id']): void {
		const menu = this.menu;
		this.menu = null;
		if (!menu) return;
		const { ref, stack } = menu;
		// Looking changes nothing, so it works even while the slots are locked.
		if (id === 'inspect') {
			this.inspecting = { ref, stack: { ...stack } };
			return;
		}
		if (this.locked) return;
		switch (id) {
			case 'read':
				// The server reads it instead of moving it (see Session.lootAction).
				this.options.act({ kind: 'quick', from: ref });
				break;
			case 'equip':
				this.options.act({ kind: 'equip', from: ref });
				break;
			case 'unequip':
				this.options.act({ kind: 'quick', from: ref });
				break;
			case 'split':
				this.asking = { kind: 'split', ref, stack };
				break;
			case 'sell':
				// One: nothing to ask. More: how many.
				if (stack.count > 1) this.asking = { kind: 'sell', ref, stack };
				else this.options.sell?.(ref, 1);
				break;
			case 'repair':
				this.options.repair?.(ref);
				break;
			case 'drop':
				if (this.options.confirmDrop) this.asking = { kind: 'drop', ref, stack };
				else this.options.act({ kind: 'drop', from: ref, count: stack.count });
				break;
		}
	}

	/** The dialog was answered: `count` for split and sell; a drop takes the whole stack. */
	answer(count: number): void {
		const asking = this.asking;
		this.asking = null;
		if (!asking || this.locked) return;
		const { kind, ref, stack } = asking;
		if (kind === 'split') this.options.act({ kind: 'split', from: ref, count });
		else if (kind === 'sell') this.options.sell?.(ref, count);
		else this.options.act({ kind: 'drop', from: ref, count: stack.count });
	}

	cancel(): void {
		this.asking = null;
	}
}

function same(a: SlotRef, b: SlotRef): boolean {
	if (a.area === 'equipment') return b.area === 'equipment' && a.slot === b.slot;
	return b.area === a.area && a.index === b.index;
}
