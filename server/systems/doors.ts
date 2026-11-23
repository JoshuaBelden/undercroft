import { AFFLICTIONS } from '../../src/lib/content/afflictions.ts';
import { DOORS, GATES } from '../../src/lib/content/doors.ts';
import { allStacks, held, removeItem } from '../../src/lib/shared/items/inventory.ts';
import { gateSeconds, firstKey } from '../../src/lib/shared/items/lootables.ts';
import type { DoorPlacement, Vec3 } from '../../src/lib/shared/map/types.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import { doorBox } from '../../src/lib/shared/map/doors.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { log } from '../log.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Doors between levels (docs/dev/map-generation.md): holding interact on a shut one (when no
 * floor item or crate is what interact would take) lifts the bar and pushes it open after
 * DOORS.openSeconds. It stays open, for everyone, and creatures can path through it from then on.
 * A locked gate (docs/dev/world.md#gates) takes a key (used up) or lockpicks in the hand, quietly,
 * each lock a chance to snap a pick; with neither, holding interact does nothing.
 *
 * A barred stair (AfflictionDef.barred, docs/dev/quests.md#the-barred-stair) only rattles: a
 * charge blows it open (`blast`), and everyone down there then has the flag that keeps it open
 * for them on later runs. With anyone down there who has it, it isn't barred at all.
 */
export class DoorSystem implements SessionSystem {
	/** Players who rattled the barred door with this hold, so a held button rattles it once. */
	private rattled = new Set<string>();

	constructor(private ctx: SessionContext) {}

	/** The barred stair's door in this map, if the Affliction has one. */
	private barredDoor(): { door: DoorPlacement; flag: string } | null {
		const barred = AFFLICTIONS[this.ctx.affliction.def.id]?.barred;
		if (!barred) return null;
		const door = this.ctx.layout.doors.find(
			(d) => d.piece === 'stairs-deep' && d.tier === barred.level - 1
		);
		return door ? { door, flag: barred.flag } : null;
	}

	mapBuilt(): void {
		const barred = this.barredDoor();
		if (barred && !this.ctx.systems.quests.anyoneHas(barred.flag)) {
			this.ctx.doors.bar(barred.door.id);
		}
	}

	/** Someone came down who has blown it before: it isn't barred for this party. */
	joined(player: Player): void {
		const barred = this.barredDoor();
		if (barred && this.ctx.systems.quests.hasFlag(player, barred.flag)) {
			this.ctx.doors.unbar(barred.door.id);
		}
	}

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
			if (!door || !ctx.doors.isBarred(door.id)) this.rattled.delete(player.id);
			else if (!this.rattled.has(player.id)) {
				this.rattled.add(player.id);
				ctx.events.push({
					kind: 'doorRattle',
					id: door.id,
					player: player.id,
					position: doorBox(door).center
				});
			}
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

	/**
	 * A charge went off here (HazardSystem): a barred door within `radius` is blown open, and
	 * everyone down here has the flag from then on. Returns the door blown, if any.
	 */
	blast(position: Vec3, radius: number): string | null {
		const barred = this.barredDoor();
		if (!barred || !this.ctx.doors.isBarred(barred.door.id)) return null;
		const at = doorBox(barred.door).center;
		const d = Math.hypot(at[0] - position[0], at[1] - position[1], at[2] - position[2]);
		if (d > radius || !this.ctx.doors.blowOpen(barred.door.id)) return null;
		this.ctx.systems.quests.happened({ kind: 'flag', flag: barred.flag });
		log.info(`The barred door ${barred.door.id} was blown open in ${this.ctx.id.slice(0, 8)}`);
		return barred.door.id;
	}

	/** Seconds it takes this player to open it, or null if they can't (barred; a gate, no key or picks). */
	private takes(door: DoorPlacement, inv: Parameters<typeof allStacks>[0]): number | null {
		if (this.ctx.doors.isBarred(door.id)) return null;
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
