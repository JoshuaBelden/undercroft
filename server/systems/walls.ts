import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { heldDef, ITEMS } from '../../src/lib/content/items.ts';
import { FALSE_WALLS, RUBBLE_WALLS, WEBS } from '../../src/lib/content/map/walls.ts';
import { works } from '../../src/lib/shared/items/durability.ts';
import { held, heldWorking } from '../../src/lib/shared/items/inventory.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import { openDoor } from '../../src/lib/shared/map/collision.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import {
	lookedAtPrySpot,
	prySpots,
	wallSpots,
	type PrySpot
} from '../../src/lib/shared/map/walls.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import type { SimEvent } from '../../src/lib/shared/player/types.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { log } from '../log.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * Walls across side passages (docs/dev/map-generation.md#false-walls, docs/dev/world.md):
 * - False walls: holding interact with a crowbar in the hand at the wall of any dead end pries at
 *   it for FALSE_WALLS.prySeconds, loudly. A false wall then comes down; solid rock just stays.
 * - Rubble: holding interact with something that `breaks` rubble in the hand (a pickaxe) breaks
 *   through in RUBBLE_WALLS.seconds, loudly.
 * - Webs: every blow that reaches one tears at it (WEBS.hits); a blade that `cuts` webs tears it
 *   through at once; a fire near it burns it away (HazardSystem calls `burn`).
 * Down is down for good, for everyone. Nav isn't rebuilt: creatures never go into what was behind.
 */
export class WallSystem implements SessionSystem {
	private spots: PrySpot[] = [];
	private rubble: PrySpot[] = [];
	private webs: PrySpot[] = [];
	/** Blows each web has taken. */
	private torn = new Map<string, number>();
	/** False walls brought down (their ids), for the tick. */
	private down = new Set<string>();

	constructor(private ctx: SessionContext) {}

	mapBuilt(): void {
		this.spots = prySpots(this.ctx.layout, PIECES, MAP_KIT);
		this.rubble = wallSpots(this.ctx.layout, 'rubble');
		this.webs = wallSpots(this.ctx.layout, 'web');
		this.torn.clear();
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
			const rubble = this.rubbleAt(player);
			if (rubble) {
				this.dig(player, rubble);
				continue;
			}
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

	/** The rubble wall a player would break at: the tool in hand, nothing else interact takes first. */
	private rubbleAt(player: Player): PrySpot | null {
		const ctx = this.ctx;
		const s = player.state;
		const tool = held(s.inventory);
		if (!ctx.canUseHands(player) || !works(tool) || !ITEMS[tool.item]?.breaks?.includes('rubble'))
			return null;
		const { origin, direction } = aimRay(s, eyeHeight(s));
		if (ctx.items.lookedAt(s, origin, direction) || ctx.crates.lookedAt(origin, direction))
			return null;
		const standing = this.rubble.filter((spot) => !this.down.has(spot.wall!));
		return lookedAtPrySpot(ctx.world, origin, direction, standing);
	}

	/** Breaking at rubble, held: loud, and through at RUBBLE_WALLS.seconds. */
	private dig(player: Player, spot: PrySpot): void {
		const ctx = this.ctx;
		const s = player.state;
		const before = s.prying;
		s.prying += TICK_DT;
		const every = RUBBLE_WALLS.every;
		if (before === 0) {
			ctx.events.push({ kind: 'dig', id: spot.wall!, player: player.id, position: spot.position });
		}
		if (before === 0 || Math.floor(s.prying / every) !== Math.floor(before / every)) {
			ctx.creatures.hear(spot.position, RUBBLE_WALLS.noise, { id: player.id, state: s });
		}
		if (s.prying < RUBBLE_WALLS.seconds) return;
		s.prying = -1;
		this.bringDown(spot.wall!, player, spot, RUBBLE_WALLS.fallNoise);
	}

	/**
	 * Blows that reach a web tear at it (the `swing` SimEvent, from the player's own simulation),
	 * bare hands' too.
	 */
	simulated(player: Player, step: { events: SimEvent[] }): void {
		for (const event of step.events) {
			if (event.kind !== 'swing') continue;
			const melee = heldDef(event.item)?.melee;
			if (!melee) continue;
			for (const web of this.webs) {
				if (
					this.down.has(web.wall!) ||
					!reaches(event.origin, event.direction, web.position, melee.range + 0.6, melee.arc + 0.3)
				)
					continue;
				const cuts = !!ITEMS[event.item]?.cuts?.includes('web');
				const blows = (this.torn.get(web.wall!) ?? 0) + 1;
				this.torn.set(web.wall!, blows);
				const through = cuts || blows >= WEBS.hits;
				this.ctx.events.push({
					kind: 'webHit',
					id: web.wall!,
					position: web.position,
					down: through,
					burned: false
				});
				if (through) this.bringDown(web.wall!, player, web, 0);
				break;
			}
		}
	}

	/** A fire at `position` burns away every web within its reach (HazardSystem). */
	burn(position: Vec3, radius: number): void {
		for (const web of this.webs) {
			if (this.down.has(web.wall!)) continue;
			const d = Math.hypot(web.position[0] - position[0], web.position[2] - position[2]);
			if (d > radius + WEBS.burn || Math.abs(web.position[1] - position[1]) > 2.5) continue;
			this.ctx.events.push({
				kind: 'webHit',
				id: web.wall!,
				position: web.position,
				down: true,
				burned: true
			});
			this.bringDown(web.wall!, null, web, 0);
		}
	}

	private bringDown(
		id: string,
		player: Player | null,
		spot: PrySpot,
		noise = FALSE_WALLS.fallNoise
	): void {
		const ctx = this.ctx;
		if (this.down.has(id)) return;
		this.down.add(id);
		openDoor(ctx.world, id);
		ctx.events.push({ kind: 'wallDown', id, player: player?.id ?? '', position: spot.position });
		if (noise > 0) ctx.creatures.hear(spot.position, noise, null);
		log.info(
			`${player?.name ?? 'An admin'} brought down false wall ${id} in ${ctx.id.slice(0, 8)}`
		);
	}

	admin = {
		// Every false wall, rubble wall and web comes down, as if pried, broken or cut.
		openWalls: () => {
			for (const spot of [...this.spots, ...this.rubble, ...this.webs]) {
				if (spot.wall) this.bringDown(spot.wall, null, spot);
			}
		}
	} satisfies SessionSystem['admin'];
}

/** Whether a swing from `origin` along `direction` reaches a point: within `range`, inside `arc`. */
function reaches(origin: Vec3, direction: Vec3, point: Vec3, range: number, arc: number): boolean {
	const to: Vec3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
	const d = Math.hypot(...to);
	if (d > range) return false;
	const along =
		(to[0] * direction[0] + to[1] * direction[1] + to[2] * direction[2]) / Math.max(d, 1e-6);
	return Math.acos(Math.min(1, along)) <= arc;
}
