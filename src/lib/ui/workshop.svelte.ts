import type { SlotRef } from '#lib/shared/items/types.ts';

/** Repair in an item's menu goes to the Workshop with that slot chosen (docs/dev/crafting.md). */
export const workshopAsk = $state<{ repair: SlotRef | null }>({ repair: null });
