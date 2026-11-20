import { ITEMS } from '../../src/lib/content/items.ts';
import { TAROT, type TarotCard } from '../../src/lib/content/tarot.ts';
import { allStacks } from '../../src/lib/shared/items/inventory.ts';
import { applyCondition } from '../../src/lib/shared/player/conditions.ts';
import { log } from '../log.ts';
import type { Player, SessionContext, SessionSystem } from './system.ts';

/**
 * The tarot draw (docs/dev/items.md#tarot): a player who comes down carrying a deck (an item with
 * `tarot`) draws one card, once a run, and it does what it says. The deck isn't used up.
 */
export class TarotSystem implements SessionSystem {
	/** Who has drawn this run. */
	private drawn = new Set<string>();

	constructor(private ctx: SessionContext) {}

	joined(player: Player, resumed: boolean): void {
		if (resumed || this.drawn.has(player.id)) return;
		const s = player.state;
		if (!allStacks(s.inventory).some((stack) => ITEMS[stack.item]?.tarot)) return;
		this.drawn.add(player.id);
		const card = TAROT[Math.floor(Math.random() * TAROT.length)];
		this.apply(player, card);
		this.ctx.events.push({ kind: 'tarot', player: player.id, card: card.id });
		log.info(`${player.name} drew ${card.name} in ${this.ctx.id.slice(0, 8)}`);
	}

	/** What a card does. */
	apply(player: Player, card: TarotCard): void {
		const s = player.state;
		const { battery, sanity, condition, meter } = card.effect;
		if (battery) s.battery = Math.max(0, Math.min(1, s.battery + battery));
		if (sanity && sanity < 0) this.ctx.hurt(player, -sanity);
		if (condition) applyCondition(s, condition.id, condition.seconds);
		if (meter) this.ctx.affliction.raise(meter);
	}

	regenerating(): void {
		this.drawn.clear();
	}
}
