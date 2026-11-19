import { Affliction } from './affliction.svelte.ts';
import { Candles } from './candles.ts';
import { Combat } from './combat.ts';
import { Crates } from './crates.svelte.ts';
import { Doors } from './doors.ts';
import type { PlayContext, PlayFeature } from './feature.ts';
import { Marks } from './marks.svelte.ts';
import { Pack } from './pack.ts';
import { Rite } from './rite.svelte.ts';
import { Ropes } from './ropes.ts';
import { Survey } from './survey.svelte.ts';
import { Surveyor } from './surveyor.ts';
import { Tend } from './tend.ts';
import { Vitals } from './vitals.ts';
import { Walls } from './walls.ts';

/**
 * Every feature on the play page, by name (docs/dev/play.md). Their hooks run in this order.
 * For `target` the order is the rule for what interact takes (as on the server): a floor item,
 * then a crate, a door, a dead end's wall (crowbar in hand), the surveyor, your own chalk mark.
 */
export function createFeatures(ctx: PlayContext) {
	const affliction = new Affliction(ctx);
	return {
		vitals: new Vitals(ctx),
		tend: new Tend(ctx),
		combat: new Combat(ctx),
		pack: new Pack(ctx),
		crates: new Crates(ctx),
		doors: new Doors(ctx),
		walls: new Walls(ctx),
		surveyor: new Surveyor(ctx),
		candles: new Candles(ctx),
		marks: new Marks(ctx),
		ropes: new Ropes(ctx),
		survey: new Survey(ctx),
		rite: new Rite(ctx, () => affliction.name),
		affliction
	} satisfies Record<string, PlayFeature>;
}

export type Features = ReturnType<typeof createFeatures>;
