import { DOORS } from '../../src/lib/content/doors.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import { doorBox } from '../../src/lib/shared/map/doors.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { log } from '../log.ts';
import { TICK_DT, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Doors between levels (docs/dev/map-generation.md): holding interact on a shut one (when no
 * floor item or crate is what interact would take) lifts the bar and pushes it open after
 * DOORS.openSeconds. It stays open, for everyone, and creatures can path through it from then on.
 */
export class DoorSystem implements SessionSystem {
	constructor(private ctx: SessionContext) {}

	step(): void {
		const ctx = this.ctx;
		for (const player of ctx.players.values()) {
			const s = player.state;
			const { origin, direction } = aimRay(s, eyeHeight(s));
			const door =
				ctx.canUseHands(player) &&
				player.lastInput?.interact &&
				!ctx.items.lookedAt(s, origin, direction) &&
				!ctx.crates.lookedAt(origin, direction)
					? ctx.doors.lookedAt(origin, direction)
					: null;
			if (!door) {
				s.unbarring = 0;
				continue;
			}
			s.unbarring += TICK_DT;
			if (s.unbarring < DOORS.openSeconds) continue;
			s.unbarring = 0;
			if (!ctx.doors.open(door.id)) continue;
			ctx.events.push({
				kind: 'doorOpen',
				id: door.id,
				player: player.id,
				position: doorBox(door).center
			});
			// Heard a long way down the stair and back through the level: creatures come to look.
			ctx.creatures.hear(door.position, DOORS.noise, null);
			log.info(`${player.name} opened door ${door.id} in ${ctx.id.slice(0, 8)}`);
		}
	}

	admin = {
		openDoors: () => this.ctx.doors.openAll()
	} satisfies SessionSystem['admin'];
}
