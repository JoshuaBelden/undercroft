import { Affliction } from './affliction.svelte.ts';
import { Bearings } from './bearings.svelte.ts';
import { Candles } from './candles.ts';
import { Combat } from './combat.ts';
import { Crates } from './crates.svelte.ts';
import { Doors } from './doors.ts';
import type { PlayContext, PlayFeature } from './feature.ts';
import { Hazards } from './hazards.ts';
import { Marks } from './marks.svelte.ts';
import { Pack } from './pack.ts';
import { Quests } from './quests.svelte.ts';
import { RITE_QUEST } from '#lib/content/quests.ts';
import { Rite } from './rite.svelte.ts';
import { Ropes } from './ropes.ts';
import { Survey } from './survey.svelte.ts';
import { Tasks } from './tasks.ts';
import { Surveyor } from './surveyor.ts';
import { Tend } from './tend.ts';
import { Training } from './training.svelte.ts';
import { Vitals } from './vitals.ts';
import { Walls } from './walls.ts';

/**
 * Every feature on the play page, by name (docs/dev/play.md). Their hooks run in this order.
 * For `target` the order is the rule for what interact takes (as on the server): a floor item,
 * then a crate, a door, a room task's object, a dead end's wall (crowbar in hand), the surveyor,
 * your own chalk mark.
 */
export function createFeatures(ctx: PlayContext) {
	const affliction = new Affliction(ctx);
	const quests = new Quests();
	// A quest's rite (docs/dev/quests.md#the-rite): begun by whoever has that quest open.
	const rite = new Rite(
		ctx,
		() => affliction.name,
		() => {
			const quest = RITE_QUEST[affliction.id];
			return quests.briefs.some((b) => b.id === quest && b.status === 'open');
		}
	);
	return {
		vitals: new Vitals(ctx),
		tend: new Tend(ctx),
		combat: new Combat(ctx),
		hazards: new Hazards(ctx),
		pack: new Pack(ctx),
		crates: new Crates(ctx),
		doors: new Doors(ctx),
		tasks: new Tasks(ctx),
		quests,
		walls: new Walls(ctx),
		surveyor: new Surveyor(ctx),
		candles: new Candles(ctx),
		marks: new Marks(ctx),
		ropes: new Ropes(ctx),
		survey: new Survey(ctx),
		rite,
		training: new Training(ctx),
		bearings: new Bearings(ctx, () => rite.known?.room ?? null),
		affliction
	} satisfies Record<string, PlayFeature>;
}

export type Features = ReturnType<typeof createFeatures>;
