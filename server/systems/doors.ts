import { DOORS, GATES } from '../../src/lib/content/doors.ts';
import { allStacks, held, removeItem } from '../../src/lib/shared/items/inventory.ts';
import { gateSeconds, firstKey } from '../../src/lib/shared/items/lootables.ts';
import type { DoorPlacement } from '../../src/lib/shared/map/types.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import { doorBox } from '../../src/lib/shared/map/doors.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { log } from '../log.ts';
import { TICK_DT, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Doors between levels (docs/dev/map-generation.md): holding interact on a shut one (when no
 * floor item or crate is what interact would take) lifts the bar and pushes it open after
 * DOORS.openSeconds. It stays open, for everyone, and creatures can path through it from then on.
 * A locked gate (docs/dev/world.md#gates) takes a key (used up) or lockpicks in the hand, quietly,
 * each lock a chance to snap a pick; with neither, holding interact does nothing.
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
			const seconds = door ? this.takes(door, s.inventory) : null;
			if (!door || seconds === null) {
				s.unbarring = 0;
				continue;
			}
			s.unbarring += TICK_DT;
			if (s.unbarring < seconds) continue;
			s.unbarring = 0;
			if (door.kind === 'gate') this.unlock(s.inventory);
			if (!ctx.doors.open(door.id)) continue;
			ctx.events.push({
				kind: 'doorOpen',
				id: door.id,
				player: player.id,
				position: doorBox(door).center
			});
			// Heard a long way down the stair and back through the level: creatures come to look.
			ctx.creatures.hear(door.position, door.kind === 'gate' ? GATES.noise : DOORS.noise, null);
			log.info(`${player.name} opened door ${door.id} in ${ctx.id.slice(0, 8)}`);
		}
	}

	/** Seconds it takes this player to open it, or null if they can't (a gate, no key or picks). */
	private takes(door: DoorPlacement, inv: Parameters<typeof allStacks>[0]): number | null {
		if (door.kind !== 'gate') return DOORS.openSeconds;
		return gateSeconds(inv);
	}

	/** A gate opened: a key is used up, or else a pick may snap. */
	private unlock(inv: Parameters<typeof allStacks>[0]): void {
		const key = firstKey(inv);
		if (key) {
			removeItem(inv, key.item, 1);
			return;
		}
		const picks = held(inv);
		if (picks && Math.random() < GATES.snap) removeItem(inv, picks.item, 1);
	}

	admin = {
		openDoors: () => this.ctx.doors.openAll()
	} satisfies SessionSystem['admin'];
}
