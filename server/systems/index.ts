import { AfflictionSystem } from './affliction.ts';
import { CheatSystem } from './cheats.ts';
import { CrateSystem } from './crates.ts';
import { CreatureSystem } from './creatures.ts';
import { DeadlineSystem } from './deadline.ts';
import { DoorSystem } from './doors.ts';
import { MarkSystem } from './marks.ts';
import { PackSystem } from './pack.ts';
import { RiteSystem } from './rite.ts';
import { RopeSystem } from './ropes.ts';
import { SanitySystem } from './sanity.ts';
import { SurveySystem } from './survey.ts';
import type { SessionContext, SessionSystem } from './system.ts';

/**
 * Every system in an expedition, by name. The order here is the order their hooks run in, and
 * their `step` in each tick: a new system goes where its step belongs (docs/dev/session.md).
 */
export function createSystems(ctx: SessionContext) {
	return {
		creatures: new CreatureSystem(ctx),
		affliction: new AfflictionSystem(ctx),
		pack: new PackSystem(ctx),
		sanity: new SanitySystem(ctx),
		rite: new RiteSystem(ctx),
		deadline: new DeadlineSystem(ctx),
		crates: new CrateSystem(ctx),
		doors: new DoorSystem(ctx),
		marks: new MarkSystem(ctx),
		ropes: new RopeSystem(ctx),
		survey: new SurveySystem(ctx),
		cheats: new CheatSystem(ctx)
	} satisfies Record<string, SessionSystem>;
}

export type Systems = ReturnType<typeof createSystems>;
