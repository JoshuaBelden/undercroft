import { CREATURES } from '../../src/lib/content/creatures.ts';
import { lookedAtFriendly } from '../../src/lib/shared/creature/talk.ts';
import { aimRay } from '../../src/lib/shared/items/weapons.ts';
import { cellAt } from '../../src/lib/shared/map/survey.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { log } from '../log.ts';
import { TICK_DT, type SessionContext, type SessionSystem } from './system.ts';

/**
 * The surveyor (docs/dev/creatures.md#the-surveyor): a friendly creature who wanders the
 * catacombs, crouching in corners. Every cell he walks through goes into his map, and he has
 * walked a few routes before anyone arrives. Holding interact on him (when no floor item or
 * crate is what interact would take) for `friendly.seconds` draws his map into yours, once each.
 */
export class SurveyorSystem implements SessionSystem {
	/** Each friendly creature's map: the cells (cellKey) it has been through. */
	private routes = new Map<string, Set<string>>();
	/** `<creature>:<player>`: who has had each one's map. */
	private shared = new Set<string>();

	constructor(private ctx: SessionContext) {}

	mapBuilt(): void {
		this.routes.clear();
		this.shared.clear();
	}

	/** The cells a friendly creature has been through (tests, admin). */
	route(id: string): ReadonlySet<string> {
		return this.routes.get(id) ?? new Set();
	}

	step(): void {
		const ctx = this.ctx;
		const map = ctx.systems.survey.map;
		const friendlies = ctx.creatures.friendlies();
		for (const f of friendlies) {
			let route = this.routes.get(f.id);
			if (!route) {
				// Where it had been before anyone came down.
				route = new Set();
				this.routes.set(f.id, route);
				const legs = CREATURES[f.kind]?.friendly?.legs ?? 0;
				for (const p of ctx.creatures.wanderRoute(f.id, legs)) {
					const cell = cellAt(map, p);
					if (cell) route.add(cell);
				}
			}
			const cell = cellAt(map, f.position);
			if (cell) route.add(cell);
		}
		for (const player of ctx.players.values()) {
			const s = player.state;
			const { origin, direction } = aimRay(s, eyeHeight(s));
			const friendly =
				ctx.canUseHands(player) &&
				player.lastInput?.interact &&
				!ctx.items.lookedAt(s, origin, direction) &&
				!ctx.crates.lookedAt(origin, direction)
					? lookedAtFriendly(ctx.world, origin, direction, friendlies)
					: null;
			const key = friendly ? `${friendly.id}:${player.id}` : '';
			if (!friendly || this.shared.has(key)) {
				s.consulting = 0;
				continue;
			}
			s.consulting += TICK_DT;
			if (s.consulting < (CREATURES[friendly.kind]?.friendly?.seconds ?? 0)) continue;
			s.consulting = 0;
			this.shared.add(key);
			const cells = ctx.systems.survey.reveal(player, this.routes.get(friendly.id) ?? []);
			ctx.events.push({
				kind: 'surveyorMap',
				player: player.id,
				creature: friendly.id,
				cells,
				position: [...friendly.position]
			});
			log.info(`${player.name} took the surveyor's map (${cells} cells) in ${ctx.id.slice(0, 8)}`);
		}
	}
}
