import type { UpperSlot } from '#lib/content/animations.ts';
import { ITEMS, type HoldPose } from '#lib/content/items.ts';
import { held } from '#lib/shared/items/inventory.ts';
import { kneeling } from '#lib/shared/player/simulate.ts';
import { tendKind } from '#lib/shared/player/tend.ts';
import type { PlayerState } from '#lib/shared/player/types.ts';
import type { UpperPose } from '#lib/game/UpperBody.ts';

const HOLDS: Record<HoldPose, UpperSlot> = {
	oneHand: 'hold_one_hand',
	twoHand: 'hold_two_hand',
	item: 'hold_item'
};

/**
 * What a player's arms are doing with what is in their hand, from their state alone: holding
 * it, firing, reloading, bandaging, changing a battery (on themselves or a teammate). Null
 * leaves the arms to the full-body clip: an empty hand, or anything that takes the whole body
 * (down, on a rope, climbing a ledge, swimming, crawling, kneeling at a medkit, a swing or a
 * throw).
 * See docs/dev/player.md#player-model.
 */
export function upperBodyPose(state: PlayerState): UpperPose | null {
	if (state.dead || state.downed || state.climbing || state.mantle || state.swimming) return null;
	if (state.stance === 'crawl') return null;
	const stack = held(state.inventory);
	const def = stack ? ITEMS[stack.item] : undefined;
	if (!def?.grip) return null;
	const w = state.weapon;
	if (w.action === 'swing' || w.action === 'draw' || w.action === 'throw') return null;
	const tending = state.tending > 0 ? tendKind(state) : null;
	// A medkit is set down and worked on kneeling: the whole body does that.
	if (kneeling(state)) return null;
	if (state.bandaging > 0 || tending === 'heal') return { slot: 'use_bandage', at: 0 };
	if (state.charging > 0 || tending === 'charge') return { slot: 'use_battery', at: 0 };
	const gun = def.firearm;
	if (gun && w.action === 'shot') {
		return { slot: def.grip.pose === 'twoHand' ? 'fire_two_hand' : 'fire_one_hand', at: w.time };
	}
	if (gun && w.action === 'reload') return { slot: 'reload', at: w.time, seconds: gun.reloadTime };
	return { slot: HOLDS[def.grip.pose], at: 0 };
}
