import { ITEMS } from '../../src/lib/content/items.ts';
import { DEFAULT_HEADLAMP } from '../../src/lib/content/items/headlamps.ts';
import { SANITY, TEND } from '../../src/lib/content/player/sanity.ts';
import { addItem } from '../../src/lib/shared/items/inventory.ts';
import { teammateSpot, type TeammateSpot } from '../../src/lib/shared/player/tend.ts';
import { log } from '../log.ts';
import type { Player, SessionContext, SessionSystem, SimulatedFrame } from './system.ts';

/**
 * Using what is in your hand on a teammate (docs/dev/items.md#using-items-on-a-teammate): the
 * shared step counts it, spends the item and reports `tend`; this gives the teammate what it
 * does. A teammate who went down, left or moved out of reach meanwhile doesn't get it, and the
 * item goes back to whoever used it.
 */
export class TendSystem implements SessionSystem {
	constructor(private ctx: SessionContext) {}

	/** Everyone on their feet but this player, for the step to look for. */
	teammatesBesides(player: Player): TeammateSpot[] {
		const spots: TeammateSpot[] = [];
		for (const other of this.ctx.players.values()) {
			if (other === player) continue;
			const spot = teammateSpot(other.id, other.state);
			if (spot) spots.push(spot);
		}
		return spots;
	}

	simulated(player: Player, step: SimulatedFrame): void {
		for (const event of step.events) {
			if (event.kind === 'tend') this.tend(player, event.patient, event.item);
		}
	}

	private tend(player: Player, id: string, item: string): void {
		const ctx = this.ctx;
		const def = ITEMS[item];
		const patient = ctx.players.get(id);
		const s = player.state;
		const p = patient?.state;
		// Still on their feet and near enough: they may have stepped back as it finished.
		const near =
			p &&
			Math.hypot(p.position[0] - s.position[0], p.position[2] - s.position[2]) <=
				TEND.range + TEND.slack;
		if (!def || !patient || !p || p.downed || p.dead || p.extracted || !near) {
			this.refund(player, item);
			return;
		}
		if (def.heal) p.sanity = Math.min(SANITY.max, p.sanity + def.heal.amount);
		else if (def.charge)
			p.battery = Math.min(1, p.battery + def.charge.volts / DEFAULT_HEADLAMP.volts);
		ctx.events.push({
			kind: 'tend',
			player: player.id,
			patient: patient.id,
			item,
			position: [...s.position]
		});
		log.info(`${player.name} used ${item} on ${patient.name}`);
	}

	/** The item back to whoever used it (on the floor at their feet if it no longer fits). */
	private refund(player: Player, item: string): void {
		if (!ITEMS[item]) return;
		const left = addItem(player.state.inventory, { item, count: 1 });
		if (left > 0) this.ctx.items.dropAll([{ item, count: left }], player.state.position);
	}
}
