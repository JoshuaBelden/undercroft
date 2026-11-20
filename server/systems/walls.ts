import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { FALSE_WALLS } from '../../src/lib/content/map/walls.ts';
import { heldWorking } from '../../src/lib/shared/items/inventory.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import { openDoor } from '../../src/lib/shared/map/collision.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import { lookedAtPrySpot, prySpots, type PrySpot } from '../../src/lib/shared/map/walls.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { log } from '../log.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * False walls (docs/dev/map-generation.md#false-walls). Holding interact with a crowbar in the
 * hand at the wall of any dead end pries at it for FALSE_WALLS.prySeconds, loudly. A false wall
 * then comes down for good, for everyone; solid rock just stays. Nav isn't rebuilt: creatures
 * never go into what was behind one.
 */
export class WallSystem implements SessionSystem {
	private spots: PrySpot[] = [];
	/** False walls brought down (their ids), for the tick. */
	private down = new Set<string>();

	constructor(private ctx: SessionContext) {}

	mapBuilt(): void {
		this.spots = prySpots(this.ctx.layout, PIECES, MAP_KIT);
		this.down.clear();
	}

	/** Ids of the false walls brought down. */
	snapshot(): string[] {
		return [...this.down];
	}

	step(): void {
		const ctx = this.ctx;
		for (const player of ctx.players.values()) {
			const s = player.state;
			if (!player.lastInput?.interact) {
				s.prying = 0;
				continue;
			}
			// Done (or tried and found solid): let go before the next.
			if (s.prying < 0) continue;
			const spot = this.aimedAt(player);
			if (!spot) {
				s.prying = 0;
				continue;
			}
			const before = s.prying;
			s.prying += TICK_DT;
			const every = FALSE_WALLS.pryEvery;
			if (before === 0) {
				ctx.events.push({
					kind: 'pry',
					target: 'wall',
					player: player.id,
					position: spot.position
				});
			}
			if (before === 0 || Math.floor(s.prying / every) !== Math.floor(before / every)) {
				ctx.creatures.hear(spot.position, FALSE_WALLS.pryNoise, { id: player.id, state: s });
			}
			if (s.prying < FALSE_WALLS.prySeconds) continue;
			s.prying = -1;
			if (spot.wall) this.bringDown(spot.wall, player, spot);
		}
	}

	/** The dead end a player would pry at: crowbar in the hand, nothing else interact takes first. */
	private aimedAt(player: Player): PrySpot | null {
		const ctx = this.ctx;
		const s = player.state;
		if (!ctx.canUseHands(player) || !heldWorking(s.inventory, 'pry')) return null;
		const { origin, direction } = aimRay(s, eyeHeight(s));
		if (ctx.items.lookedAt(s, origin, direction) || ctx.crates.lookedAt(origin, direction))
			return null;
		const standing = this.spots.filter((spot) => !spot.wall || !this.down.has(spot.wall));
		return lookedAtPrySpot(ctx.world, origin, direction, standing);
	}

	private bringDown(id: string, player: Player | null, spot: PrySpot): void {
		const ctx = this.ctx;
		if (this.down.has(id)) return;
		this.down.add(id);
		openDoor(ctx.world, id);
		ctx.events.push({ kind: 'wallDown', id, player: player?.id ?? '', position: spot.position });
		ctx.creatures.hear(spot.position, FALSE_WALLS.fallNoise, null);
		log.info(
			`${player?.name ?? 'An admin'} brought down false wall ${id} in ${ctx.id.slice(0, 8)}`
		);
	}

	admin = {
		// Every false wall comes down, as if pried.
		openWalls: () => {
			for (const spot of this.spots) if (spot.wall) this.bringDown(spot.wall, null, spot);
		}
	} satisfies SessionSystem['admin'];
}
