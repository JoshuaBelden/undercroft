import type { SlotRef } from '#lib/shared/items/types.ts';

/**
 * What the Workshop opens on (docs/dev/crafting.md): a slot to mend (Repair in an item's menu).
 * Taken once by the page.
 */
export const workshopAsk = $state<{ repair: SlotRef | null }>({ repair: null });
