import type { CrateSlot } from '#lib/shared/items/types.ts';
import type { ItemStack } from '#lib/shared/player/types.ts';

/**
 * The next slot after `from` in reading order that holds something or is still sealed: to the
 * right, then the start of the next row (the crate's grid is laid out in slot order). Null if
 * there is none.
 */
export function nextStop(slots: readonly CrateSlot[], from: number): number | null {
	for (let index = from + 1; index < slots.length; index++) {
		if (slots[index] !== null) return index;
	}
	return null;
}

/**
 * Looting with the controller: after X sends an item out of a crate, the focus moves on to the
 * next thing in it, so pressing X again and again empties the crate. The server says what became
 * of the item, so this waits for the crate's slots to change: only an item that left its slot
 * entirely moves the focus. With no room in the pack, or only part of a stack fitting, it stays.
 * See docs/dev/controller.md.
 */
export class CrateFocus {
	/** X sent the stack in this slot away, and the server hasn't answered yet. */
	private sent: { index: number; stack: ItemStack } | null = null;

	/**
	 * A face button pressed in the crate screen. `index`: the crate slot it was pressed on (-1:
	 * somewhere else); `sent`: it was X, and the stack there went out. Any other press forgets an
	 * X still waiting for its answer.
	 */
	press(slots: readonly CrateSlot[], index: number, sent: boolean): void {
		const stack = slots[index];
		this.sent = sent && stack && stack !== 'hidden' ? { index, stack: { ...stack } } : null;
	}

	/**
	 * The crate's slots as the server tells them now. Once the stack X sent has left its slot
	 * entirely: that slot, and the one the focus moves on to. Null while there is no answer yet, if
	 * some of it is still there, or if nothing comes after it (the focus stays put).
	 */
	update(slots: readonly CrateSlot[]): { from: number; to: number } | null {
		const sent = this.sent;
		if (!sent) return null;
		const now = slots[sent.index];
		// Unchanged: no answer yet, or none coming (a full pack changes nothing).
		if (now && now !== 'hidden' && now.item === sent.stack.item && now.count === sent.stack.count) {
			return null;
		}
		this.sent = null;
		// Part of the stack is still there, or something else is now.
		if (now !== null) return null;
		const to = nextStop(slots, sent.index);
		return to === null ? null : { from: sent.index, to };
	}
}
