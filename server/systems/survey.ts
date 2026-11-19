import { MAP_KIT } from '../../src/lib/content/map/kit.ts';
import { SURVEY } from '../../src/lib/content/map/survey.ts';
import { PIECES } from '../../src/lib/shared/map/pieces.generated.ts';
import {
	carriesSurvey,
	sketchCells,
	surveyMap,
	type SurveyMap
} from '../../src/lib/shared/map/survey.ts';
import type { Vec3 } from '../../src/lib/shared/map/types.ts';
import { eyeHeight } from '../../src/lib/shared/player/simulate.ts';
import { log } from '../log.ts';
import { Surveys } from '../survey.ts';
import { TICK_DT, type Player, type SessionContext, type SessionSystem } from './system.ts';

/**
 * The map (docs/dev/map.md), held on the map screen with a notebook in the pack and the hands
 * free. Sketching: standing still for SURVEY.sketchSeconds draws what is around you. Showing:
 * next to a teammate who has a notebook too, SURVEY.shareSeconds copies each map into the
 * other. Each sketches or shows once per hold (-1 until it is let go).
 */
export class SurveySystem implements SessionSystem {
	/** What a map can show of this one, and what each player has drawn in theirs. */
	map!: SurveyMap;
	private surveys!: Surveys;

	constructor(private ctx: SessionContext) {}

	/** A new map: what was drawn of the old one is no use. */
	mapBuilt(): void {
		this.map = surveyMap(this.ctx.layout, PIECES, MAP_KIT);
		this.surveys = new Surveys(this.map);
	}

	step(): void {
		for (const player of this.ctx.players.values()) {
			const s = player.state;
			const hold = player.lastInput?.survey ?? null;
			const able = this.ctx.canUseHands(player) && carriesSurvey(s.inventory);
			if (hold !== 'sketch') s.sketching = 0;
			else if (s.sketching >= 0) {
				const still = Math.hypot(s.velocity[0], s.velocity[2]) < SURVEY.stillSpeed;
				s.sketching = able && still ? s.sketching + TICK_DT : 0;
				if (s.sketching >= SURVEY.sketchSeconds) {
					s.sketching = -1;
					this.sketch(player);
				}
			}
			if (hold !== 'share') s.sharing = 0;
			else if (s.sharing >= 0) {
				const partner = able ? this.partner(player) : null;
				s.sharing = partner ? s.sharing + TICK_DT : 0;
				if (partner && s.sharing >= SURVEY.shareSeconds) {
					s.sharing = -1;
					this.show(player, partner);
				}
			}
		}
	}

	/** Draw what the player can see from where they stand into their map. */
	private sketch(player: Player): void {
		const ctx = this.ctx;
		const s = player.state;
		const eye: Vec3 = [s.position[0], s.position[1] + eyeHeight(s), s.position[2]];
		const cells = sketchCells(this.map, ctx.world, s.position, eye, SURVEY.sketchRange);
		this.surveys.draw(player.id, cells);
		this.send(player);
		ctx.events.push({ kind: 'sketch', player: player.id, position: [...s.position] });
		ctx.creatures.hear(s.position, SURVEY.sketchNoise, player);
	}

	/** The nearest teammate on their feet, close enough and with a notebook, to show your map to. */
	private partner(player: Player): Player | null {
		const at = player.state.position;
		let best: Player | null = null;
		let bestDistance: number = SURVEY.shareRange;
		for (const other of this.ctx.players.values()) {
			const o = other.state;
			if (other === player || o.downed || o.dead || o.extracted || !carriesSurvey(o.inventory)) {
				continue;
			}
			const d = Math.hypot(o.position[0] - at[0], o.position[1] - at[1], o.position[2] - at[2]);
			if (d <= bestDistance) {
				best = other;
				bestDistance = d;
			}
		}
		return best;
	}

	/** Two maps shown to each other: both now have everything either had. */
	private show(player: Player, partner: Player): void {
		this.surveys.share(player.id, partner.id);
		this.send(player);
		this.send(partner);
		this.ctx.events.push({
			kind: 'showMap',
			player: player.id,
			with: partner.id,
			position: [...player.state.position]
		});
		log.info(`${player.name} showed their map to ${partner.name} in ${this.ctx.id.slice(0, 8)}`);
	}

	/**
	 * Draw these cells into a player's map (the surveyor's, shared with them) and send it if it
	 * grew. Returns how many were new to them.
	 */
	reveal(player: Player, cells: Iterable<string>): number {
		const added = this.surveys.draw(player.id, [...cells]);
		if (added > 0) this.send(player);
		return added;
	}

	private send(player: Player): void {
		this.ctx.send(player, { type: 'survey', cells: this.surveys.snapshot(player.id) });
	}

	joined(player: Player): void {
		this.send(player);
	}

	regenerated(): void {
		for (const player of this.ctx.players.values()) this.send(player);
	}

	admin = {
		revealMap: (player) => {
			this.surveys.revealAll(player.id);
			this.send(player);
		},
		clearMap: (player) => {
			this.surveys.clear(player.id);
			this.send(player);
		}
	} satisfies SessionSystem['admin'];
}
